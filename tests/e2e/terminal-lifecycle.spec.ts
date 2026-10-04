import { expect, test, type Locator, type Page } from "@playwright/test";
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
  await page.setViewportSize({ width: 1_600, height: 900 });
});

async function workspace(page: Page) {
  const response = await page.request.get(`${origin}/api/v1/terminal/workspace`, { headers });
  expect(response.ok()).toBe(true);
  return (await response.json()).document as { entries: Array<{ runtimeId: string; parentFolderId: string | null; name: string }>; folders: Array<{ id: string; parentFolderId: string | null; name: string }> };
}

async function sessions(page: Page) {
  const response = await page.request.get(`${origin}/api/v1/terminal/sessions`, { headers });
  expect(response.ok()).toBe(true);
  return (await response.json()).sessions as Array<{ id: string; runtimeId: string; pid: number }>;
}

async function drag(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();
  await page.mouse.move(from!.x + 60, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(from!.x + 80, from!.y + from!.height / 2, { steps: 3 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 12 });
  await page.mouse.up();
}

test("ordnet Terminals und Unterordner per Drag & Drop und öffnet bestehende Sitzungen im Split", async ({ page }) => {
  await page.goto(`${workbenchUrl}/terminal`);
  await page.locator(".terminal-empty-state button").click();
  const sidebar = page.getByRole("complementary", { name: "Terminal-Sidebar" });
  await expect(page.locator(".terminal-tree-status.is-connected")).toBeVisible();
  await sidebar.getByRole("button", { name: "Terminal öffnen", exact: true }).click();
  await expect(page.locator(".terminal-tree-entry")).toHaveCount(2);
  await sidebar.getByRole("button", { name: "Neuer Ordner", exact: true }).click();
  const editor = sidebar.locator(".terminal-tree-input");
  await editor.fill("Agenten");
  await editor.press("Enter");
  const folder = sidebar.locator(".terminal-tree-row.is-folder").filter({ hasText: "Agenten" });
  await drag(page, sidebar.locator(".terminal-tree-row.is-entry").filter({ hasText: "Terminal 1" }), folder);
  await expect.poll(async () => {
    const doc = await workspace(page);
    return doc.entries.find((entry) => entry.name === "Terminal 1")?.parentFolderId === doc.folders.find((item) => item.name === "Agenten")?.id;
  }).toBe(true);
  await page.getByRole("button", { name: "Aktionen für Agenten", exact: true }).click();
  await page.getByRole("menuitem", { name: "Neuer Unterordner", exact: true }).click();
  await editor.fill("Tests");
  await editor.press("Enter");
  await expect.poll(async () => {
    const doc = await workspace(page);
    return doc.folders.find((item) => item.name === "Tests")?.parentFolderId === doc.folders.find((item) => item.name === "Agenten")?.id;
  }).toBe(true);
  const source = sidebar.locator(".terminal-tree-row.is-entry").filter({ hasText: "Terminal 1" });
  const sourceBox = await source.boundingBox();
  await page.mouse.move(sourceBox!.x + 60, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + 80, sourceBox!.y + sourceBox!.height / 2, { steps: 3 });
  const drop = page.locator("[data-terminal-drop-zone=right]");
  await expect(drop).toBeVisible();
  const dropBox = await drop.boundingBox();
  await page.mouse.move(dropBox!.x + dropBox!.width / 2, dropBox!.y + dropBox!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(2);
  await expect(page.locator(".terminal-session-pane.is-visible .terminal-session[data-status=connected]")).toHaveCount(2);
  expect(await sessions(page)).toHaveLength(2);
  await page.reload();
  await expect(page.getByRole("button", { name: "Agenten", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tests", exact: true })).toBeVisible();
  await expect(page.locator(".terminal-session-pane.is-visible")).toHaveCount(2);
});

test("startet ein geparktes Terminal neu und beendet persistente Sitzungen nach Bestätigung", async ({ page }) => {
  await page.goto(`${workbenchUrl}/terminal`);
  await page.locator(".terminal-empty-state button").click();
  await expect(page.locator(".terminal-session[data-status=connected]")).toHaveCount(1);
  const before = (await sessions(page))[0]!;
  const sidebar = page.getByRole("complementary", { name: "Terminal-Sidebar" });
  await sidebar.getByRole("button", { name: "Terminal öffnen", exact: true }).click();
  await expect(page.locator(".terminal-tree-entry")).toHaveCount(2);
  await page.getByRole("button", { name: "Aktionen für Terminal 1", exact: true }).click();
  await page.getByRole("menuitem", { name: "Terminal neu starten", exact: true }).click();
  await expect.poll(async () => (await sessions(page)).find((session) => session.id === before.id)?.pid).not.toBe(before.pid);
  await page.locator(".terminal-tree-row.is-entry").filter({ hasText: "Terminal 1" }).click();
  const input = page.locator(".terminal-session-pane.is-visible .xterm-helper-textarea");
  await input.fill("printf '__RESTART_WORKS__\\n'");
  await input.press("Enter");
  await expect(page.locator(".terminal-session-pane.is-visible .xterm-screen")).toContainText("__RESTART_WORKS__");
  await page.getByRole("button", { name: "Aktionen für Terminal 1", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Persistent machen", exact: true }).click();
  await page.getByRole("button", { name: "Aktionen für Terminal 1", exact: true }).click();
  await page.getByRole("menuitem", { name: "Terminal beenden", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await sessions(page)).toHaveLength(2);
  await page.getByRole("dialog").getByRole("button", { name: "Löschen", exact: true }).click();
  await expect.poll(async () => (await sessions(page)).map((session) => session.id)).not.toContain(before.id);
  await expect(page.locator(".terminal-tree-entry")).toHaveCount(1);
});
