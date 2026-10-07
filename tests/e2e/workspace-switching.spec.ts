import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

let secondServer: ChildProcess | undefined;
let mainOrigin: string;
let secondOrigin: string;

test.beforeAll(async ({ baseURL }) => {
  mainOrigin = new URL(baseURL!).origin;
  const secondPort = Number(new URL(mainOrigin).port) + 300;
  secondOrigin = process.env.WRAPT_E2E_WORKSPACE_URL ?? `http://127.0.0.1:${secondPort}`;
  if (process.env.WRAPT_E2E_WORKSPACE_URL) {
    if (process.env.WRAPT_E2E_ISOLATED !== "true") throw new Error("Der zweite Workspace muss eine isolierte Testinstanz sein.");
    return;
  }
  // Eine zweite echte Instanz mit eigener Datenbank und eigener Konfiguration.
  const occupied = await fetch(`${secondOrigin}/api/v1/health`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false);
  if (occupied) throw new Error(`Der Testport ${secondPort} ist bereits belegt.`);
  secondServer = spawn(process.execPath, ["scripts/start-e2e-server.mjs"], {
    env: {
      ...process.env,
      WRAPT_E2E_PORT: String(secondPort),
      WRAPT_E2E_EXTERNAL: "false",
      WRAPT_E2E_ROOT: undefined,
      WRAPT_E2E_KEEP_ROOT: undefined,
    },
    stdio: "ignore",
  });
  await expect.poll(async () => {
    if (secondServer?.exitCode !== null) throw new Error("Der zweite Testserver wurde vorzeitig beendet.");
    return fetch(`${secondOrigin}/api/v1/health`, { signal: AbortSignal.timeout(1000) }).then((response) => response.ok, () => false);
  }, { timeout: 30_000 }).toBe(true);
});

test.afterAll(async () => {
  if (!secondServer || secondServer.exitCode !== null) return;
  const stopped = once(secondServer, "exit");
  secondServer.kill("SIGTERM");
  await stopped;
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ main, second }) => {
    const entries = [
      { id: "test-main", name: "Testserver", url: main, addedAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null, customName: true },
      { id: "test-second", name: "Forschungsserver", url: second, addedAt: "2026-10-01T00:00:00.000Z", lastUsedAt: null, customName: true },
    ];
    if (sessionStorage.getItem("workspace-test-seeded")) return;
    sessionStorage.setItem("workspace-test-seeded", "true");
    localStorage.setItem("wrapt.workspaces.v1", JSON.stringify({ version: 1, workspaces: entries }));
    localStorage.setItem("wrapt.sidebar-preferences.v1", JSON.stringify({ version: 5, state: {
      hiddenPages: window.location.origin === second ? ["projects", "codex", "workbench"] : ["codex", "workbench"],
      explicitlyVisibleDefaultPages: [],
    } }));
    localStorage.setItem("wrapt.app-preferences.v1", JSON.stringify({ version: 1, state: { defaultPage: "hermes-agent" } }));
  }, { main: mainOrigin, second: secondOrigin });
});

async function openSwitcher(page: Page) {
  const trigger = page.locator(".sidebar-shell .workspace-switcher-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  const picker = page.getByRole("dialog", { name: "Server wechseln", exact: true });
  await expect(picker).toBeVisible();
  return picker;
}

async function switchTo(page: Page, name: string) {
  const picker = await openSwitcher(page);
  await picker.getByRole("button", { name: `${name} öffnen` }).click();
}

/**
 * Der Wechsel-Hash ist Transport für den Registry-Stand und wird auf der
 * Zielseite nach der Synchronisation entfernt. Erst danach stimmt die URL
 * exakt — Navigation und Boot der Zielseite brauchen dafür Zeit.
 */
async function expectLanded(page: Page, expected: string) {
  await expect.poll(async () => page.url(), { timeout: 20_000 }).toBe(expected);
}

test("wechselt auf derselben Seite zwischen zwei echten Workspaces und zurück", async ({ page }) => {
  await page.goto(`${mainOrigin}/wrapt/hermes-agent?path=%2Fchat`);
  await switchTo(page, "Forschungsserver");
  await expectLanded(page, `${secondOrigin}/wrapt/hermes-agent?path=%2Fchat`);
  await expect(page.locator(".sidebar-shell .workspace-switcher-trigger")).toContainText("Forschungsserver");
  await switchTo(page, "Testserver");
  await expectLanded(page, `${mainOrigin}/wrapt/hermes-agent?path=%2Fchat`);
  await page.goto(`${mainOrigin}/wrapt/settings?abschnitt=workspaces`);
  await switchTo(page, "Forschungsserver");
  await expectLanded(page, `${secondOrigin}/wrapt/settings?abschnitt=workspaces`);
});

test("öffnet bei deaktivierten und unbekannten Zielseiten das Dashboard statt der Startseite", async ({ page }) => {
  await page.goto(`${mainOrigin}/wrapt/projects`);
  await switchTo(page, "Forschungsserver");
  await expectLanded(page, `${secondOrigin}/wrapt`);
  await expect(page.locator(".sidebar-shell .workspace-switcher-trigger")).toContainText("Forschungsserver");
  await page.goto(`${mainOrigin}/wrapt/fehlendes-werkzeug`);
  await switchTo(page, "Forschungsserver");
  await expectLanded(page, `${secondOrigin}/wrapt`);
  await page.goto(`${mainOrigin}/wrapt/plugins/tool/fehlendes-werkzeug`);
  await switchTo(page, "Forschungsserver");
  await expectLanded(page, `${secondOrigin}/wrapt`);
});

test("bleibt beim Dashboard-Wechsel trotz Hermes-Startseite auf dem Dashboard", async ({ page }) => {
  // Der Startzustand entspricht einer Workspace-Ankunft auf dem Dashboard.
  await page.goto(`${mainOrigin}/wrapt/#wraptWorkspaces=%5B%5D`);
  await expectLanded(page, `${mainOrigin}/wrapt/`);
  await switchTo(page, "Forschungsserver");
  await expectLanded(page, `${secondOrigin}/wrapt/`);
});

test("hält die Serverliste sichtbar und schließt beide Menüs per Außenklick und Escape", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${mainOrigin}/wrapt/settings`);
  const picker = await openSwitcher(page);
  await expect(picker.getByRole("button", { name: "Server hinzufügen" })).toHaveCount(0);
  const more = picker.getByRole("button", { name: /Weitere Aktionen für Forschungsserver/ });
  await more.click();
  const details = page.getByRole("group", { name: "Weitere Aktionen für Forschungsserver", exact: true });
  await expect(details).toBeVisible();
  const pickerBox = await picker.boundingBox();
  const detailsBox = await details.boundingBox();
  expect(detailsBox!.x).toBeGreaterThanOrEqual(pickerBox!.x + pickerBox!.width);
  await details.getByRole("button", { name: "Verbindung prüfen" }).click();
  await expect(picker).toBeVisible();
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(picker).toBeVisible();
  await more.click();
  await picker.getByText("Testserver", { exact: true }).click();
  await expect(details).toBeHidden();
  await more.click();
  await page.getByRole("heading", { name: "Version", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(details).toBeHidden();
  await page.getByRole("button", { name: "Workspaces", exact: true }).click();
  await expect(page.locator("#settings-workspaces").getByRole("button", { name: "Server hinzufügen" })).toBeVisible();
});

test("erlaubt Bearbeiten im Detailmenü und bleibt bei schmalen Ansichten im Bildschirm", async ({ page }) => {
  await page.goto(`${mainOrigin}/wrapt/settings`);
  let picker = await openSwitcher(page);
  await picker.getByRole("button", { name: /Weitere Aktionen für Forschungsserver/ }).click();
  await page.getByRole("group", { name: "Weitere Aktionen für Forschungsserver", exact: true }).getByRole("button", { name: "Bearbeiten" }).click();
  const editor = page.getByRole("dialog", { name: "Server bearbeiten" });
  await editor.getByRole("textbox", { name: "Name" }).fill("Forschung");
  await expect(editor.getByRole("textbox", { name: "Name" })).toHaveValue("Forschung");
  await editor.getByRole("button", { name: "Abbrechen" }).click();
  await expect(editor).toBeHidden();
  await page.keyboard.press("Escape");

  for (const width of [320, 390, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    const navigationButton = page.getByRole("button", { name: "Navigation öffnen", exact: true });
    if (await navigationButton.isVisible()) await navigationButton.click();
    await page.getByRole("button", { name: /Aktueller Server:.*Server wechseln/ }).filter({ visible: true }).click();
    picker = page.getByRole("dialog", { name: "Server wechseln", exact: true });
    await picker.getByRole("button", { name: /Weitere Aktionen für Forschungsserver/ }).click();
    const details = page.getByRole("group", { name: "Weitere Aktionen für Forschungsserver", exact: true });
    const box = await details.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(width === 844 ? 390 : 844);
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const nav = page.getByRole("dialog", { name: "Navigation", exact: true });
    if (await nav.isVisible()) await page.keyboard.press("Escape");
  }
});

test("behält ein verfügbares Plugin-Werkzeug auch bei verzögerter Registrierung auf dem Zielserver", async ({ page, request, browserName }) => {
  const examples = await request.get(`${mainOrigin}/api/v1/plugins/examples`);
  expect(examples.ok()).toBe(true);
  const example = (await examples.json()).examples[0];
  const content = { ...example, slug: `workspace-test-${browserName}`, name: "Workspace-Testwerkzeug", surfaces: ["page", "sidebar"] };
  delete content.exampleId;
  delete content.sourceDirectory;
  for (const origin of [mainOrigin, secondOrigin]) {
    const created = await request.post(`${origin}/api/v1/plugins/drafts`, {
      headers: { "tailscale-user-login": "user@example.com" }, data: content,
    });
    expect(created.ok()).toBe(true);
    const draft = (await created.json()).draft;
    const activated = await request.post(`${origin}/api/v1/plugins/drafts/${draft.id}/activate`, {
      headers: { "tailscale-user-login": "user@example.com" },
    });
    expect(activated.ok()).toBe(true);
  }
  let releaseRuntime!: () => void;
  const pending = new Promise<void>((resolve) => { releaseRuntime = resolve; });
  await page.route(`${secondOrigin}/api/v1/extensions/runtime`, async (route) => {
    await pending;
    await route.continue();
  });
  await page.goto(`${mainOrigin}/wrapt/plugins/tool/${content.slug}`);
  await expect(page.getByRole("heading", { name: content.name, exact: true })).toBeVisible();
  await switchTo(page, "Forschungsserver");
  // Die Zielseite bootet erst (Bundle, Abfragen), danach zeigt die verzögerte
  // Registrierung den Ladezustand, bis die blockierte Antwort freigegeben wird.
  await expect(page.getByLabel("Ansicht wird geladen")).toBeVisible({ timeout: 20_000 });
  releaseRuntime();
  await expect(page.getByRole("heading", { name: content.name, exact: true })).toBeVisible();
  await expectLanded(page, `${secondOrigin}/wrapt/plugins/tool/${content.slug}`);
});
