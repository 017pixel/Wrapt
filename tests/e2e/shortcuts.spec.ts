import { expect, request, test } from "@playwright/test";
import { resetTerminalTestWorkspace } from "./helpers/terminal";
import { apiIdentityHeaders, e2eOrigin } from "./helpers/environment";
import type { Server } from "node:http";
import { startShortcutFixtures, stopShortcutFixtures } from "./helpers/shortcutFixtures";

const port = Number(process.env.WRAPT_E2E_PORT ?? 19310);
let servers: Server[] = [];
let consoleErrors: string[] = [];
test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, serviceWorkers: "block" });
test.beforeAll(async () => {
  if (process.env.WRAPT_SHORTCUT_FIXTURES_EXTERNAL !== "true") servers = await startShortcutFixtures(port);
});
test.afterAll(async () => {
  // Der letzte Test klappt „Allgemein“ ein und ändert die Reihenfolge. Beides
  // wird serverseitig geteilt und würde sonst in nachfolgende Specs derselben
  // Testinstanz lecken. Kurz warten, damit ein ausstehender Abgleich nicht
  // den Reset überschreibt.
  await new Promise((resolve) => setTimeout(resolve, 800));
  const api = await request.newContext({ baseURL: e2eOrigin, extraHTTPHeaders: apiIdentityHeaders("user@example.com") });
  try {
    const response = await api.put("/api/v1/settings/ui", { data: { clientId: "shortcut-e2e-cleanup", changes: [
      { key: "appPreferences", value: { version: 3, state: {} } },
      { key: "sidebarPreferences", value: { version: 6, state: {} } },
    ] } });
    expect(response.ok()).toBe(true);
  } finally {
    await api.dispose();
  }
  await stopShortcutFixtures(servers);
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
  expect(consoleErrors).toEqual([]);
});
test.beforeEach(async ({ request, page }) => {
  consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(`${message.text()} (${message.location().url})`); });
  const response = await request.put("/api/v1/settings/ui", {
    headers: { "tailscale-user-login": "user@example.com" },
    data: { clientId: "shortcut-e2e", changes: [
      { key: "appPreferences", value: { version: 3, state: {} } },
      { key: "sidebarPreferences", value: { version: 6, state: {} } },
    ] },
  });
  expect(response.ok()).toBe(true);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("shortcuts-seeded")) return;
    sessionStorage.setItem("shortcuts-seeded", "true");
    localStorage.setItem("wrapt.workspaces.v1", JSON.stringify({ version: 1, workspaces: [
      { id: "self", name: "Testserver", url: location.origin, addedAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null, customName: true },
      { id: "second", name: "Zweitserver", url: "http://127.0.0.1:49999", addedAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null, customName: true },
    ] }));
  });
});

test("nummeriert zehn Seiten in Sidebar-Reihenfolge und wechselt mit 0 zur zehnten", async ({ page }) => {
  await page.goto("/wrapt/");
  const sidebar = page.locator(".sidebar-shell");
  await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  const positions = () => sidebar.locator(".sidebar-item-icon, .sidebar-item-text").evaluateAll((elements) =>
    elements.map((element) => { const { x, y } = element.getBoundingClientRect(); return { x, y }; }));
  const before = await positions();
  await page.keyboard.down("Control"); await page.keyboard.down("Shift");
  await expect(sidebar.getByRole("link", { name: "Nutzung", exact: true }).locator("kbd")).toHaveText("N");
  await expect(sidebar.getByRole("link", { name: "Einstellungen", exact: true }).locator("kbd")).toHaveText("E");
  await expect(sidebar.getByRole("link", { name: "Plugins", exact: true }).locator("kbd")).toHaveText("P");
  expect(await positions()).toEqual(before);
  await expect(sidebar.locator("[data-number-hint]")).toHaveCount(10);
  await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true }).locator("kbd")).toHaveText("1");
  const tenth = sidebar.locator("a[data-navigation-id]").nth(9);
  const target = await tenth.getAttribute("href");
  await expect(tenth.locator("kbd")).toHaveText("0");
  await page.keyboard.press("Digit0");
  await page.keyboard.up("Shift"); await page.keyboard.up("Control");
  await expect(page).toHaveURL(new RegExp(target!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$"));
  await expect(sidebar.locator(".sidebar-shortcut-badge")).toHaveCount(0);
});

test("vergibt bei weniger als zehn Seiten keine Zahlen an Account und System", async ({ page, request }) => {
  const response = await request.put("/api/v1/settings/ui", {
    data: { clientId: "shortcut-account-e2e", changes: [
      { key: "sidebarPreferences", value: { version: 6, state: { hiddenPages: ["ki-skills"] } } },
    ] },
  });
  expect(response.ok()).toBe(true);
  await page.goto("/wrapt/");
  const sidebar = page.locator(".sidebar-shell");
  await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "KI-Skills", exact: true })).toHaveCount(0);
  await page.keyboard.down("Control"); await page.keyboard.down("Shift");
  await expect(sidebar.locator("[data-number-hint]")).toHaveCount(9);
  const account = sidebar.getByRole("navigation", { name: "Account und System" });
  await expect(account.locator("kbd")).toHaveText(["P", "N", "E"]);
  await expect(account.locator("[data-number-hint]")).toHaveCount(0);
  const currentUrl = page.url();
  await page.keyboard.press("Digit0");
  await expect(page).toHaveURL(currentUrl);
  await page.keyboard.press("KeyP");
  await expect(page).toHaveURL(/\/wrapt\/plugins$/);
  await page.keyboard.up("Shift"); await page.keyboard.up("Control");
});

test("öffnet Direktziele, Serverauswahl und Limits-Popup", async ({ page }) => {
  await page.goto("/wrapt/");
  await expect(page.locator(".sidebar-shell")).toBeVisible();
  for (const [code, path] of [["KeyE", "settings"], ["KeyN", "usage"], ["KeyP", "plugins"]]) {
    await page.keyboard.press(`Control+Shift+${code}`);
    await expect(page).toHaveURL(new RegExp(`/wrapt/${path}$`));
  }
  await expect(page.locator(".sidebar-shell .workspace-switcher-trigger")).toBeVisible();
  await page.keyboard.press("Control+Shift+KeyS");
  await expect(page.getByRole("dialog", { name: "Server wechseln", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+Shift+KeyL");
  await expect(page.getByTestId("usage-limits-card")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("usage-limits-card")).toHaveCount(0);
});

test("speichert neue Kürzel, deaktiviert Aktionen und lässt die Aufnahme ungestört", async ({ page }) => {
  await page.goto("/wrapt/settings#einstellungen:navigation");
  const settings = page.locator("#settings-shortcuts");
  const record = settings.getByRole("button", { name: "Einstellungen: Tastenkürzel ändern" });
  await record.click();
  await page.keyboard.press("Control+Alt+KeyJ");
  await expect(record).toContainText("Ctrl + Alt + J");
  await expect(page).toHaveURL(/settings#einstellungen:navigation$/);
  await page.reload();
  await expect(record).toContainText("Ctrl + Alt + J");
  await settings.getByRole("switch", { name: "Plugins aktivieren" }).click();
  await page.keyboard.press("Control+Shift+KeyP");
  await expect(page).toHaveURL(/settings#einstellungen:navigation$/);
  await page.keyboard.press("Control+Alt+KeyJ");
  await expect(page).toHaveURL(/\/wrapt\/settings$/);
});

for (const [path, title, input] of [["t3-code", "T3 Code", "T3-Eingabe"], ["code-editor?folder=%2Ftmp%2Fshortcut-fixture", "Editor", "Editor-Eingabe"]] as const) {
  test(`wechselt aus ${title} und erhält ungespeicherte Eingaben ohne Tastenweitergabe`, async ({ page }) => {
    await page.route("**/api/v1/services", async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      for (const service of data.services) if (service.id === "code-server") { service.state = "active"; service.mode = "embedded"; }
      await route.fulfill({ response, json: data });
    });
    await page.goto(`/wrapt/${path}`);
    const iframe = page.frameLocator(`iframe[title="${title}"]`);
    const textbox = iframe.getByRole("textbox", { name: input });
    await textbox.fill("Ungespeichert");
    await textbox.press("Control+Shift+Digit1");
    await expect(page).toHaveURL(/\/wrapt\/?$/);
    const frame = await (await page.locator(`iframe[title="${title}"]`).elementHandle())!.contentFrame();
    expect(await frame!.evaluate(() => (window as unknown as { receivedKeys: string[] }).receivedKeys)).not.toContain("Digit1");
    await page.locator(`.sidebar-shell a[href$="/${title === "Editor" ? "code-editor" : "t3-code"}"]`).click();
    await expect(textbox).toHaveValue("Ungespeichert");
  });
}


test("wechselt aus dem echten Terminal ohne Shell-Eingabe durch das Kürzel", async ({ page }) => {
  const inputs: string[] = [];
  page.on("websocket", (socket) => socket.on("framesent", (frame) => {
    const payload = String(frame.payload);
    if (payload.includes('"type":"terminal.input"')) inputs.push(payload);
  }));
  await resetTerminalTestWorkspace(page, "user@example.com");
  await page.goto("/wrapt/terminal");
  await page.locator(".terminal-empty-state button").click();
  const input = page.locator(".persistent-route.is-active .xterm-helper-textarea").first();
  await expect(input).toBeAttached({ timeout: 20_000 });
  await page.locator(".persistent-route.is-active .terminal-viewport").first().click();
  await expect(page.locator(".persistent-route.is-active .xterm-screen")).toContainText("$");
  await page.keyboard.press("a");
  await expect.poll(() => inputs.length).toBeGreaterThan(0);
  inputs.length = 0;
  await page.keyboard.press("Control+Shift+Digit1");
  await expect(page).toHaveURL(/\/wrapt\/?$/);
  expect(inputs).toEqual([]);
});

test("aktualisiert Nummern nach Drag-and-drop und zeigt eingeklappte Gruppen nur während des Haltens", async ({ page }) => {
  await page.goto("/wrapt/");
  const sidebar = page.locator(".sidebar-shell");
  await sidebar.getByRole("link", { name: "Notizen", exact: true }).dragTo(sidebar.getByRole("link", { name: "Dashboard", exact: true }), { targetPosition: { x: 60, y: 3 } });
  await sidebar.getByRole("button", { name: "Allgemein einklappen" }).click();
  await page.keyboard.down("Control"); await page.keyboard.down("Shift");
  await expect(sidebar.getByRole("link", { name: "Notizen", exact: true }).locator("kbd")).toHaveText("1");
  await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true }).locator("kbd")).toHaveText("2");
  await page.keyboard.up("Shift"); await page.keyboard.up("Control");
  await expect(sidebar.getByRole("button", { name: "Allgemein ausklappen" })).toBeVisible();
  await sidebar.getByRole("button", { name: "Sidebar einklappen" }).click();
  const icons = sidebar.locator(".sidebar-item-icon");
  const positions = () => icons.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().x));
  await expect(sidebar).toHaveClass(/is-collapsed/);
  await page.waitForTimeout(400);
  const before = await positions();
  await page.keyboard.down("Control"); await page.keyboard.down("Shift");
  await expect(sidebar.locator("[data-number-hint]")).toHaveCount(10);
  expect(await positions()).toEqual(before);
  await page.keyboard.up("Shift"); await page.keyboard.up("Control");
});
