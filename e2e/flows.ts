import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { getJson } from "./server";

export const mainPages = [
  { path: "/", heading: "Dashboard" },
  { path: "/projects", heading: "Projekte" },
  { path: "/notizen", testId: "notes-workspace" },
  { path: "/usage", heading: "Nutzung und Limits" },
  { path: "/settings", button: "Design" },
  { path: "/files", listbox: "Dateien und Ordner" },
  { path: "/plugins", heading: "Plugins" },
  { path: "/ki-skills", button: "Neuen Skill anlegen" },
  { path: "/previews", tablist: "Preview-Projekte" },
  { path: "/terminal", button: "Terminal öffnen" },
  { path: "/codex", button: "Codex öffnen" },
  { path: "/claude", button: "Claude Code öffnen" },
  { path: "/t3-code", embedded: true },
  { path: "/code-editor", embedded: true },
  { path: "/opencode", embedded: true },
  { path: "/hermes-agent", embedded: true },
] as const;

export async function openPage(page: Page, path: string) {
  await page.goto(`/wrapt${path}`);
  await expect(page.getByText("Etwas ist abgestürzt", { exact: true })).toHaveCount(0);
}

export async function visitMainPages(page: Page) {
  // Fremde Apps werden nicht gestartet oder angemeldet. Nur ihr Dokument wird
  // als Fixture ausgeliefert; Routing und native Wrapt-Daten bleiben echt.
  await page.route((url) => /^\/(hermes|t3|opencode)(\/|$)/.test(url.pathname), (route) => {
    if (!route.request().isNavigationRequest()) return route.continue();
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><html lang='de'><body><h1>Isolierte Werkzeug-Fixture</h1></body></html>" });
  });
  for (const entry of mainPages) {
    await openPage(page, entry.path);
    if ("heading" in entry) await expect(page.getByRole("heading", { name: entry.heading, exact: true })).toBeVisible();
    else if ("button" in entry) await expect(page.getByRole("button", { name: entry.button, exact: true }).first()).toBeVisible();
    else if ("listbox" in entry) await expect(page.getByRole("listbox", { name: entry.listbox })).toBeVisible();
    else if ("tablist" in entry) await expect(page.getByRole("tablist", { name: entry.tablist })).toBeVisible();
    else if ("testId" in entry) await expect(page.getByTestId(entry.testId)).toBeVisible();
    else {
      const content = page.getByRole("main");
      await expect(content.locator("iframe").or(content.getByText(/Kein passendes Projekt|nicht installiert|nicht erreichbar|nicht verfügbar|nicht eingebettet|OpenCode|Code-Server/)).first()).toBeVisible();
    }
  }
}

export async function createNote(page: Page, title: string) {
  await openPage(page, "/notizen");
  await expect(page.getByTestId("notes-workspace")).toBeVisible();
  await openNotesSidebar(page);
  const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/v1/notes" && response.request().method() === "POST");
  await page.getByRole("button", { name: "Neue Seite", exact: true }).first().click();
  const { note } = await (await response).json();
  await expect(page.getByRole("textbox", { name: "Notiztitel" })).toHaveValue(/^Notiz/);
  await renameNote(page, title);
  return note.id as string;
}

export async function openNotesSidebar(page: Page) {
  await expect(page.getByTestId("notes-workspace")).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Notizen", exact: true });
  if (!await sidebar.isVisible()) {
    // Die zuletzt geöffnete Notiz kann während des List-Abrufs wechseln.
    // Beide fachlichen Öffnen-Aktionen bleiben über denselben Locator erreichbar.
    await page.getByTestId("notes-workspace").getByRole("button", { name: /^(Seiten öffnen|Seitenleiste öffnen)$/ }).click();
  }
  await expect(sidebar).toBeVisible();
}

export async function renameNote(page: Page, title: string) {
  const response = page.waitForResponse((response) => /\/api\/v1\/notes\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === "PATCH");
  const field = page.getByRole("textbox", { name: "Notiztitel" });
  await field.fill(title);
  await field.blur();
  expect((await response).ok()).toBe(true);
  await expect(field).toHaveValue(title);
}

export async function noteLifecycle(page: Page, api: APIRequestContext, title: string) {
  const id = await createNote(page, title);
  const content = `${title} mit dauerhaftem Inhalt`;
  await page.getByTestId("note-editor").fill(content);
  await expect.poll(async () => (await getJson(api, `/notes/${id}`)).note.content).toContain(content);
  await renameNote(page, `${title} geändert`);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Notiztitel" })).toHaveValue(`${title} geändert`);
  await expect(page.getByTestId("note-editor")).toContainText(content);
  await page.getByRole("button", { name: "Weitere Aktionen", exact: true }).click();
  await page.getByRole("menuitem", { name: "In den Papierkorb", exact: true }).click();
  await expect.poll(async () => (await getJson(api, `/notes/${id}`)).note.archived).toBe(true);
  // Papierkorb ist der vorgesehene Löschweg. Den alten Link erneut öffnen.
  await openPage(page, `/notizen?note=${id}`);
  await expect(page.getByRole("status").filter({ hasText: "Diese Seite liegt im Papierkorb." })).toBeVisible();
  await page.getByRole("button", { name: "Wiederherstellen", exact: true }).click();
  await expect.poll(async () => (await getJson(api, `/notes/${id}`)).note.archived).toBe(false);
  return id;
}

export async function assertHealthy(page: Page, errors: string[]) {
  await expect(page.getByText("Etwas ist abgestürzt", { exact: true })).toHaveCount(0);
  // WebSocket-Abbrüche beim document navigation sind normale Transportmeldungen.
  // Kein anderer Konsolenfehler und keine unbehandelte Exception wird ausgeblendet.
  expect(errors.filter((message) => !/^WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/api\/v1\/(editor|notifications)\/ws.*failed:/.test(message))).toEqual([]);
}
