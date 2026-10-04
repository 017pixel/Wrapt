import { expect, test, type Locator, type Page, type WebSocketRoute } from "@playwright/test";
import { resetTerminalTestWorkspace } from "./helpers/terminal";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";

const login = process.env.WRAPT_E2E_USER ?? "user@example.com";
const headers = apiIdentityHeaders(login);
const origin = process.env.WRAPT_E2E_URL!;
test.use({ extraHTTPHeaders: headers });
test.describe.configure({ retries: 0 });
test.beforeEach(async ({ page }) => {
  test.skip(!origin, "Diese Tests benötigen eine ausdrücklich isolierte Testinstanz.");
  await resetTerminalTestWorkspace(page, login);
});

async function open(page: Page) {
  await page.goto(`${workbenchUrl}/terminal`);
  await page.locator(".terminal-empty-state button").click();
  await expect(page.locator(".terminal-tree-status.is-connected").first()).toBeVisible({ timeout: 5_000 });
}

async function command(pane: Locator, text: string, marker: string) {
  const input = pane.locator(".xterm-helper-textarea");
  await input.fill(text);
  await input.press("Enter");
  await expect(pane.locator(".xterm-screen")).toContainText(marker, { timeout: 5_000 });
}

async function sessions(page: Page) {
  const response = await page.request.get(`${origin}/api/v1/terminal/sessions`, { headers });
  expect(response.ok()).toBe(true);
  return (await response.json()).sessions as Array<{ id: string; runtimeId: string; cols: number; rows: number; pid: number }>;
}

test("öffnet und teilt zügig, passt die PTY bei jedem Resize an und erhält beide Bildschirme", async ({ page }) => {
  await page.setViewportSize({ width: 1_600, height: 900 });
  await open(page);
  await expect(page.locator(".topbar-project-picker")).toHaveCount(0);
  const left = page.locator(".terminal-session-pane.is-visible").first();
  await command(left, "printf '__LEFT_NATIVE__\\n'", "__LEFT_NATIVE__");
  const start = Date.now();
  await page.getByRole("button", { name: "Neues Terminal rechts teilen", exact: true }).click();
  await expect(page.locator(".terminal-tree-status.is-connected").nth(1)).toBeVisible({ timeout: 5_000 });
  const right = page.locator(".terminal-session-pane.is-visible").nth(1);
  await command(right, "printf '__RIGHT_NATIVE__\\n'", "__RIGHT_NATIVE__");
  expect(Date.now() - start).toBeLessThan(5_000);
  const ids = (await sessions(page)).map((session) => session.id).sort();
  let previous = (await sessions(page)).map((session) => session.cols);
  for (const width of [1_250, 1_850, 1_450]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => (await sessions(page)).map((session) => session.cols)).not.toEqual(previous);
    previous = (await sessions(page)).map((session) => session.cols);
    await expect(left.locator(".xterm-screen")).toContainText("__LEFT_NATIVE__");
    await expect(right.locator(".xterm-screen")).toContainText("__RIGHT_NATIVE__");
  }
  const handle = page.getByRole("separator", { name: "Breite der Terminal-Sidebar ändern" });
  await handle.focus();
  await handle.press("ArrowRight");
  await handle.press("ArrowRight");
  await expect.poll(async () => (await sessions(page)).map((session) => session.cols)).not.toEqual(previous);
  const split = page.getByRole("separator", { name: "Terminal-Aufteilung anpassen" });
  const box = await split.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + 100, box!.y + box!.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.reload();
  await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(2);
  await expect(left.locator(".xterm-screen")).toContainText("__LEFT_NATIVE__");
  await expect(right.locator(".xterm-screen")).toContainText("__RIGHT_NATIVE__");
  expect((await sessions(page)).map((session) => session.id).sort()).toEqual(ids);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(1);
  await expect.poll(async () => (await page.locator(".terminal-session-pane.is-visible .terminal-viewport").boundingBox())?.width ?? 0).toBeGreaterThan(800);
});

test("verbindet nach Socket-Abbruch dieselbe Sitzung ohne gelben Hänger", async ({ page }) => {
  let socket: WebSocketRoute | undefined;
  let connections = 0;
  await page.routeWebSocket("**/api/v1/terminal", (route) => {
    route.connectToServer();
    socket = route;
    connections += 1;
  });
  await open(page);
  const pane = page.locator(".terminal-session-pane.is-visible");
  await command(pane, "printf '__BEFORE_DISCONNECT__\\n'", "__BEFORE_DISCONNECT__");
  const before = await sessions(page);
  await socket!.close({ code: 1001, reason: "Isolierter Reconnect-Test" });
  await expect.poll(() => connections, { timeout: 5_000 }).toBe(2);
  await expect(page.locator(".terminal-session")).toHaveAttribute("data-status", "connected", { timeout: 5_000 });
  await command(pane, "printf '__AFTER_RECONNECT__\\n'", "__AFTER_RECONNECT__");
  await expect(pane.locator(".xterm-screen")).toContainText("__BEFORE_DISCONNECT__");
  expect((await sessions(page)).map((session) => session.id)).toEqual(before.map((session) => session.id));
});

test("meldet einen Layout-Ladefehler und erholt sich automatisch", async ({ page }) => {
  let failing = true;
  await page.route("**/api/v1/terminal/workspace", async (route) => {
    if (route.request().method() === "GET" && failing) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Test: Layout vorübergehend nicht verfügbar" } }) });
    } else await route.continue();
  });
  await page.goto(`${workbenchUrl}/terminal`);
  await expect(page.locator(".terminal-area [role=alert]")).toBeVisible();
  failing = false;
  await expect(page.locator(".terminal-empty-state button")).toBeVisible({ timeout: 7_000 });
  await expect(page.locator(".terminal-area [role=alert]")).toHaveCount(0);
  await page.locator(".terminal-empty-state button").click();
  await expect(page.locator(".terminal-tree-status.is-connected")).toBeVisible({ timeout: 5_000 });
});

test("bewahrt mobile Split-Terminals bei Auswahl und Drehung und bietet Touch-Aktionen", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1_280, height: 800 }, hasTouch: true, extraHTTPHeaders: headers });
  try {
    const page = await context.newPage();
    await open(page);
    await command(page.locator(".terminal-session-pane.is-visible").first(), "printf '__MOBILE_LEFT__\\n'", "__MOBILE_LEFT__");
    await page.getByRole("button", { name: "Neues Terminal rechts teilen", exact: true }).click();
    await expect(page.locator(".terminal-tree-status.is-connected").nth(1)).toBeVisible();
    await command(page.locator(".terminal-session-pane.is-visible").nth(1), "printf '__MOBILE_RIGHT__\\n'", "__MOBILE_RIGHT__");
    const ids = (await sessions(page)).map((session) => session.id).sort();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(1);
    await expect(page.locator(".terminal-session-pane")).toHaveCount(2);
    await expect(page.locator(".terminal-session-pane.is-visible .xterm-screen")).toContainText("__MOBILE_RIGHT__");
    await page.getByRole("button", { name: "Terminal-Sidebar einblenden", exact: true }).click();
    await page.locator(".terminal-tree-row.is-entry").first().click();
    await expect(page.getByRole("complementary", { name: "Terminal-Sidebar" })).not.toBeVisible();
    await expect(page.locator(".terminal-session-pane.is-visible .xterm-screen")).toContainText("__MOBILE_LEFT__");
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(1);
    await command(page.locator(".terminal-session-pane.is-visible"), "printf '__LANDSCAPE_INPUT__\\n'", "__LANDSCAPE_INPUT__");
    await page.getByRole("button", { name: "Terminal-Sidebar einblenden", exact: true }).click();
    const actions = page.getByRole("button", { name: "Aktionen für Terminal 1", exact: true });
    const box = await actions.boundingBox();
    // CSS-Transforms können 44 px als 43.99998 melden; nur Rundungsrauschen zulassen.
    expect(box!.width).toBeGreaterThanOrEqual(44 - 0.01);
    expect(box!.height).toBeGreaterThanOrEqual(44 - 0.01);
    await actions.click();
    await page.getByRole("menuitemcheckbox", { name: "Persistent machen", exact: true }).click();
    await actions.click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Persistenz entfernen", exact: true })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1_280, height: 800 });
    await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(2);
    expect((await sessions(page)).map((session) => session.id).sort()).toEqual(ids);
  } finally { await context.close(); }
});
