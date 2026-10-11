import { test, expect } from "./personas";
import { assertHealthy, noteLifecycle, openPage, orbitLifecycle, visitMainPages } from "./flows";
import { getJson } from "./server";
import { mockUsageData, scarceAccountLabel } from "../tests/e2e/helpers/usage";

async function settings(page: Parameters<typeof openPage>[0], tab: string) {
  await openPage(page, "/settings");
  await page.getByRole("button", { name: tab, exact: true }).click();
}

for (const theme of ["Ember", "Grove", "T3 Code"]) {
  test(`Theme ${theme}: alle Hauptseiten und Notizen funktionieren nach Speichern und Reload`, async ({ page, api, appErrors }) => {
    await settings(page, "Design");
    await page.getByRole("button", { name: theme, exact: true }).click();
    await page.getByRole("button", { name: "Theme speichern", exact: true }).click();
    await expect(page.getByText("Theme gespeichert.", { exact: true })).toBeVisible();
    const saved = (await getJson(api, "/system/appearance")).theme.preset;
    await page.reload();
    await expect(page.getByRole("button", { name: theme, exact: true })).toHaveAttribute("aria-pressed", "true");
    expect((await getJson(api, "/system/appearance")).theme.preset).toBe(saved);
    await visitMainPages(page);
    await noteLifecycle(page, api, `Theme ${theme}`);
    await assertHealthy(page, appErrors);
  });
}

test("Start-App: Root öffnet Notes, direkte Seiten und Kernaktionen bleiben erreichbar", async ({ page, api, appErrors }) => {
  await settings(page, "Start-App");
  await page.getByRole("button", { name: /^Notes \/notizen/ }).click();
  await page.reload();
  await visitMainPages(page, "notizen");
  await noteLifecycle(page, api, "Neue Start-App");
  await assertHealthy(page, appErrors);
});

test("Seiten-Sichtbarkeit: ausgeblendete Start-App fällt aufs Dashboard zurück", async ({ page, api, appErrors }) => {
  await settings(page, "Start-App");
  await page.getByRole("button", { name: /^Projekte \/projects/ }).click();
  await page.getByRole("button", { name: "Navigation", exact: true }).click();
  // Der Switch selbst befindet sich im klickbaren Button.
  await page.getByRole("switch", { name: "Projekte", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Projekte", exact: true })).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await visitMainPages(page);
  await noteLifecycle(page, api, "Ausgeblendete Seite");
  await assertHealthy(page, appErrors);
});

test("Orbit-Palette: ausgeblendeter Block sperrt weder Arbeitsflächen noch Notizen", async ({ page, api, appErrors }) => {
  await settings(page, "Navigation");
  await page.getByRole("switch", { name: "Code-Snippet", exact: true }).click();
  await page.reload();
  await openPage(page, "/orbit");
  await expect(page.getByRole("button", { name: /Neues Code-Snippet/ })).toHaveCount(0);
  await orbitLifecycle(page, api, "Reduzierte Palette");
  await visitMainPages(page);
  await noteLifecycle(page, api, "Palette geändert");
  await assertHealthy(page, appErrors);
});

test("Dashboard-Bereiche: ausgeblendete Widgets lassen Navigation und Kern-Flows intakt", async ({ page, api, appErrors }) => {
  await settings(page, "Navigation");
  await page.getByRole("switch", { name: "Serverstatus", exact: true }).click();
  await page.reload();
  await visitMainPages(page);
  await noteLifecycle(page, api, "Dashboard-Widget verborgen");
  await assertHealthy(page, appErrors);
});

test("Layout zurücksetzen löscht keine serverseitigen Notizen oder Orbit-Arbeitsflächen", async ({ page, api, appErrors, seededNotes }) => {
  const boardIds = (await getJson(api, "/orbit")).document.boards.map((board: { id: string }) => board.id);
  await settings(page, "Layout");
  await page.getByRole("button", { name: "Layout zurücksetzen", exact: true }).click();
  await page.getByRole("dialog", { name: "Layout zurücksetzen?" }).getByRole("button", { name: "Layout zurücksetzen", exact: true }).click();
  await page.reload();
  expect((await getJson(api, "/notes")).notes).toHaveLength(seededNotes.length);
  expect((await getJson(api, "/orbit")).document.boards.map((board: { id: string }) => board.id)).toEqual(boardIds);
  await visitMainPages(page);
  await noteLifecycle(page, api, "Nach Layout-Reset");
  await assertHealthy(page, appErrors);
});

test("Rechtsklick, Schnellaktionen und Statusleisten-Schrift wirken über Seiten hinweg", async ({ page, api, appErrors }) => {
  await settings(page, "Rechtsklick");
  await page.getByRole("button", { name: "Manuell", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Platz 1" })).toBeVisible();
  await page.getByRole("button", { name: "Schrift vergrößern", exact: true }).click();
  await expect.poll(async () => (await getJson(api, "/system/context-menu")).contextMenu.statusBar.fontSizePx).toBe(13);
  await page.getByRole("button", { name: "Globale Menüs", exact: true }).click();
  await expect.poll(async () => (await getJson(api, "/system/context-menu")).contextMenu.enabled).toBe(false);
  await page.reload();
  await visitMainPages(page);
  await orbitLifecycle(page, api, "Ohne Kontextmenüs");
  await noteLifecycle(page, api, "Rechtsklick geändert");
  await assertHealthy(page, appErrors);
});

test("Benachrichtigungen: globaler Push und Quellenwechsel erhalten Navigation und Speichern", async ({ page, api, appErrors }) => {
  await settings(page, "Benachrichtigungen");
  await page.getByRole("button", { name: /^Server-Push für wichtige Ereignisse/ }).click();
  await expect.poll(async () => (await getJson(api, "/notifications/settings")).preferences.pushEnabled).toBe(true);
  await page.getByRole("button", { name: "Terminal Push", exact: true }).click();
  await page.reload();
  await visitMainPages(page);
  await noteLifecycle(page, api, "Push geändert");
  await assertHealthy(page, appErrors);
});

test("Limitüberwachung: deaktiviertes Werkzeug aktualisiert Nutzung, Dashboard und Notes", async ({ page, api, appErrors }) => {
  await settings(page, "Werkzeuge");
  await page.getByRole("switch", { name: "Limitüberwachung Codex", exact: true }).click();
  await expect.poll(async () => (await getJson(api, "/system/usage-monitoring")).monitoring.codex).toBe(false);
  await page.reload();
  await visitMainPages(page);
  await noteLifecycle(page, api, "Limits geändert");
  await assertHealthy(page, appErrors);
});

test("T3-Kanal: Nightly wird gespeichert, ohne während des Durchlaufs einen Dienst neu zu starten", async ({ page, api, appErrors }) => {
  await settings(page, "System");
  await page.getByRole("button", { name: /^Nightly/ }).click();
  await expect.poll(async () => (await getJson(api, "/system/t3-channel")).configuredChannel).toBe("nightly");
  await page.reload();
  await expect(page.getByRole("button", { name: /^Nightly/ })).toHaveAttribute("aria-pressed", "true");
  await visitMainPages(page);
  await noteLifecycle(page, api, "Nightly konfiguriert");
  await assertHealthy(page, appErrors);
});

test("Maskottchen und Dashboard-Hintergrund verändern keine Kernaktionen", async ({ page, api, appErrors }) => {
  await settings(page, "Easter Eggs");
  await page.getByRole("switch", { name: /Maskottchen anzeigen/ }).click();
  await expect.poll(async () => (await getJson(api, "/system/mascot")).mascot.enabled).toBe(true);
  await page.getByRole("switch", { name: "Dashboard-Hintergrund anzeigen" }).click();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Dashboard-Hintergrund anzeigen" })).toHaveAttribute("aria-checked", "true");
  await visitMainPages(page);
  await noteLifecycle(page, api, "Extras aktiviert");
  await assertHealthy(page, appErrors);
});

test("Nutzungsfilter, Warnschwelle und Ansicht: berechnete Liste stimmt auch nach Reload", async ({ page, api, appErrors }) => {
  await mockUsageData(page);
  await openPage(page, "/usage");
  const table = page.getByRole("table", { name: "Aktuelle Limits je Account" });
  await expect(table.getByRole("button", { name: /Details$/ })).toHaveCount(4);
  await page.getByRole("button", { name: "Nur problematische", exact: true }).click();
  await page.getByRole("button", { name: "Ohne Daten ausblenden", exact: true }).click();
  await expect(table.getByRole("button", { name: /Details$/ })).toHaveCount(1);
  await expect(table.getByRole("button", { name: `${scarceAccountLabel} Details` })).toBeVisible();
  await page.getByRole("button", { name: "Ansichtseinstellungen", exact: true }).click();
  const view = page.getByRole("dialog", { name: "Ansichtseinstellungen" });
  await view.getByRole("combobox").selectOption("30");
  await view.getByRole("checkbox", { name: "Token-KPIs", exact: true }).check();
  await page.getByRole("button", { name: "Ansicht schließen", exact: true }).click();
  await page.reload();
  await expect(table.getByRole("button", { name: /Details$/ })).toHaveCount(1);
  await expect(page.getByText("Tokens heute", { exact: true })).toBeVisible();
  await visitMainPages(page);
  await noteLifecycle(page, api, "Gefilterte Nutzung");
  await assertHealthy(page, appErrors);
});

test("Notizensuche: Titel-, Bereichs- und Datumsfilter wirken gemeinsam ohne Datenverlust", async ({ page, api, appErrors }) => {
  await openPage(page, "/notizen");
  await page.getByRole("complementary", { name: "Notizen", exact: true }).getByRole("button", { name: /Suchen/ }).click();
  const search = page.getByRole("dialog", { name: "Notizen durchsuchen" });
  await search.getByRole("textbox", { name: "Notizen durchsuchen" }).fill("Kiesel-1");
  await expect(search.getByRole("option")).toHaveCount(1);
  await search.getByRole("button", { name: "Nur Titel durchsuchen", exact: true }).click();
  await expect(search.getByRole("option")).toHaveCount(0);
  await search.getByRole("button", { name: "Nur Titel durchsuchen", exact: true }).click();
  await search.getByRole("button", { name: "Auf Seiten", exact: true }).click();
  await search.getByRole("menuitem", { name: "Persona 001", exact: true }).click();
  await search.getByRole("button", { name: "Erstellt", exact: true }).click();
  await search.getByRole("menuitem", { name: "Heute", exact: true }).click();
  await expect(search.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await visitMainPages(page);
  await noteLifecycle(page, api, "Suchfilter geändert");
  await assertHealthy(page, appErrors);
});

test("Workspace-Registry: Hinzufügen und Entfernen ändern die Navigation ohne Verlust der Kernaktionen", async ({ page, api, appErrors }) => {
  test.setTimeout(120_000); // Zwei vollständige Hauptseiten-/Notizen-Durchläufe.
  // Die Gegenstelle ist kontrolliert; kein fremder oder produktiver Serverkontakt.
  await page.route("https://persona.example.ts.net/api/v1/health", (route) => route.fulfill({
    json: { status: "ok", version: "2.2.9", appName: "Wrapt", instanceName: "Persona-Server" },
    headers: { "access-control-allow-origin": "*" },
  }));
  await settings(page, "Workspaces");
  await page.getByRole("button", { name: "Server hinzufügen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Server hinzufügen", exact: true });
  await dialog.getByRole("textbox", { name: "URL", exact: true }).fill("https://persona.example.ts.net");
  await dialog.getByRole("textbox", { name: "Name", exact: true }).fill("Persona-Server");
  await dialog.getByRole("button", { name: "Verbindung prüfen", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Server hinzufügen", exact: true })).toBeEnabled();
  await dialog.getByRole("button", { name: "Server hinzufügen", exact: true }).click();
  await expect.poll(async () => (await getJson(api, "/workspaces/registry")).document.entries.some((entry: { name: string }) => entry.name === "Persona-Server")).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: /Aktueller Server:.*Server wechseln/ })).toBeVisible();
  await visitMainPages(page);
  await noteLifecycle(page, api, "Registry geändert");
  await settings(page, "Workspaces");
  await page.getByRole("button", { name: /^Weitere Aktionen für Persona-Server\./ }).click();
  await page.getByRole("group", { name: "Weitere Aktionen für Persona-Server", exact: true }).getByRole("button", { name: "Entfernen", exact: true }).click();
  await page.getByRole("dialog", { name: "Workspace entfernen?", exact: true }).getByRole("button", { name: "Workspace entfernen", exact: true }).click();
  await expect.poll(async () => (await getJson(api, "/workspaces/registry")).document.entries.some((entry: { name: string }) => entry.name === "Persona-Server")).toBe(false);
  await visitMainPages(page);
  await noteLifecycle(page, api, "Registry wieder entfernt");
  await assertHealthy(page, appErrors);
});

test("Plugin-Aktivierung verändert Seiten und Navigation, während Notes weiter speichert", async ({ page, api, appErrors }) => {
  test.setTimeout(120_000); // Aktiv und inaktiv jeweils alle Kern-Flows prüfen.
  await openPage(page, "/plugins");
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installieren", exact: true }).click();
  const plugin = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Fokus-Timer", exact: true }) });
  await plugin.getByRole("button", { name: "Installieren", exact: true }).click();
  await expect(plugin.getByRole("button", { name: "Deaktivieren", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: "Fokus-Timer", exact: true })).toBeVisible();
  await visitMainPages(page);
  await noteLifecycle(page, api, "Plugin aktiv");
  await openPage(page, "/plugins");
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installieren", exact: true }).click();
  await plugin.getByRole("button", { name: "Deaktivieren", exact: true }).click();
  await expect(plugin.getByRole("button", { name: "Aktivieren", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Fokus-Timer", exact: true })).toHaveCount(0);
  await visitMainPages(page);
  await noteLifecycle(page, api, "Plugin deaktiviert");
  await openPage(page, "/plugins");
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installieren", exact: true }).click();
  await plugin.getByRole("button", { name: "Deinstallieren", exact: true }).click();
  await page.getByRole("dialog", { name: /deinstallieren/ }).getByRole("button", { name: "Deinstallieren", exact: true }).click();
  await expect(plugin.getByRole("button", { name: "Installieren", exact: true })).toBeVisible();
  await assertHealthy(page, appErrors);
});
