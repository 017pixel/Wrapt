import { expect, test, type Page } from "@playwright/test";
import { workbenchUrl } from "./helpers/environment";

const login = "user@example.com";
const defaultTitlePattern = /^Notiz – \d{2}\.\d{2}\.\d{4}$/;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": login },
  viewport: { width: 1440, height: 960 },
});

async function openNotes(page: Page) {
  await page.goto(`${workbenchUrl}/notizen`);
  await expect(page.locator(".notes-workspace")).toBeVisible();
}

async function createPage(page: Page): Promise<string> {
  const createdResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/v1/notes",
  );
  await page.locator(".notes-sidebar .notes-sidebar-new").click();
  const created = await (await createdResponse).json() as { note: { id: string } };
  await expect(page).toHaveURL(new RegExp(`[?&]note=${created.note.id}(?:&|$)`));
  const title = page.getByLabel("Notiztitel");
  await expect(title).toHaveValue(defaultTitlePattern, { timeout: 10000 });
  return (await title.inputValue()).trim();
}

test.describe("Notizen", () => {
  test("erstellt eine leere Seite mit Datumstitel, formatiert und speichert dauerhaft", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await openNotes(page);

    await createPage(page);
    // Keine Vorlagen mehr: Titel ist „Notiz – Datum“, der Inhalt bleibt leer.
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await expect(editor).toHaveText("");

    const noteTitle = `E2E-Notiz ${Date.now().toString().slice(-6)}`;
    const title = page.getByLabel("Notiztitel");
    await title.fill(noteTitle);
    await title.blur();

    await editor.click();
    await editor.pressSequentially("# Erster Abschnitt");
    await editor.press("Enter");
    await editor.pressSequentially("- Punkt eins");
    await editor.press("Enter");
    await editor.pressSequentially("- Punkt zwei");

    // Autosave abwarten, dann neu laden und Persistenz prüfen.
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
    await page.reload();

    await expect(page.getByLabel("Notiztitel")).toHaveValue(noteTitle);
    await expect(page.locator(".notes-workspace h1")).toHaveText("Erster Abschnitt");
    await expect(page.locator(".notes-workspace li")).toHaveCount(2);
    await expect(
      page.locator(".notes-sidebar .notes-tree-row").getByRole("button", { name: noteTitle }),
    ).toBeVisible();
    // Verbindungsabbrüche der Live-Kanäle (Editor, Benachrichtigungen) meldet
    // der Browser als Konsolenfehler, die App verbindet sich still neu — wie
    // in terminal-sidebar-improvements.spec.ts herausgefiltert.
    expect(consoleErrors.filter((message) => !/ws:\/\/127\.0\.0\.1:\d+\/api\/v1\/(?:editor|notifications)\/ws/i.test(message))).toEqual([]);
  });

  test("öffnet das Slash-Menü und fügt Blöcke ein", async ({ page }) => {
    await openNotes(page);
    await createPage(page);
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    await editor.pressSequentially("Mein Block");
    await editor.press("Enter");
    await editor.pressSequentially("/callout");

    const menu = page.locator(".note-slash-menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("option", { name: /Callout/ }).click();

    await expect(page.locator(".note-callout")).toBeVisible();
    await expect(page.getByLabel("Callout-Titel")).toHaveValue("");
  });

  test("speichert Aufgaben als globale Notes-Checkliste", async ({ page }) => {
    await openNotes(page);
    await createPage(page);
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    await editor.pressSequentially("/todo");

    const menu = page.locator(".note-slash-menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("option", { name: /Aufgabe/ }).click();
    await editor.pressSequentially("Globale Aufgabe");
    const task = editor.locator('ul[data-type="taskList"] input[type="checkbox"]');
    await expect(task).toBeVisible();
    await task.check();
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");

    await page.reload();
    await expect(page.locator('.notes-workspace .note-editor-content ul[data-type="taskList"] input[type="checkbox"]')).toBeChecked();
  });

  test("fügt Tabelle, Formel und Inhaltsverzeichnis über das Slash-Menü ein", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    await openNotes(page);
    await createPage(page);
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    for (const [command, selector, label] of [
      ["/table", ".notes-workspace table", "Tabelle"],
      ["/math", ".tiptap-mathematics-render", "Formel"],
      ["/toc", ".note-toc", "Inhaltsverzeichnis"],
    ]) {
      await editor.pressSequentially(command);
      await expect(page.locator(".note-slash-menu")).toBeVisible();
      await page.locator(".note-slash-menu").getByRole("option").first().click();
      await expect(page.locator(selector).first()).toBeVisible();
      await editor.press("Control+End");
      await editor.press("Enter");
      console.log(`Slash-Befehl ${label} eingefügt`);
    }
    await expect(page.getByText("Etwas ist abgestürzt")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("wandelt eingefügtes Markdown automatisch in Blöcke um", async ({ page, browserName }) => {
    // Firefox liefert für synthetische ClipboardEvents kein clipboardData
    // (Sicherheitsgrenze für nicht vertrauenswürdige Events) — der Handler
    // bekommt allenfalls leere Daten. Echte Einfügungen enthalten dort die
    // regulären Zwischenablage-Daten und nehmen denselben Codepfad wie hier
    // auf Chromium und WebKit.
    test.skip(browserName === "firefox", "Synthetische Einfügung trägt in Firefox keine Zwischenablage-Daten.");
    await openNotes(page);
    await createPage(page);
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();

    await page.evaluate(() => {
      const target = document.querySelector(".notes-workspace .note-editor-content");
      if (!(target instanceof HTMLElement)) throw new Error("Editor fehlt");
      target.focus();
      const data = new DataTransfer();
      data.setData("text/plain", "## Aus Markdown\n\n- eins\n- zwei\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");
      const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) throw new Error("Kein Fokus");
      active.dispatchEvent(event);
    });

    await expect(page.locator(".notes-workspace h2")).toHaveText("Aus Markdown");
    await expect(page.locator(".notes-workspace li")).toHaveCount(2);
    await expect(page.locator(".notes-workspace table")).toBeVisible();
  });

  test("erstellt Unterseiten über Slash, verlinkt sie und öffnet sie", async ({ page }) => {
    await openNotes(page);
    const parentTitle = `Eltern ${Date.now().toString().slice(-6)}`;
    await createPage(page);
    await page.getByLabel("Notiztitel").fill(parentTitle);
    await page.getByLabel("Notiztitel").blur();
    await expect(page.locator(".notes-note-current")).toHaveText(parentTitle);

    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    await editor.pressSequentially("Siehe ");
    await editor.pressSequentially("/page");
    await page.locator(".note-slash-menu").getByRole("option", { name: /Unterseite/ }).click();

    // Die neue Seite öffnet sich direkt, trägt den Datumstitel und hängt unter der Elternseite.
    await expect(page.getByLabel("Notiztitel")).toHaveValue(defaultTitlePattern);
    await expect(page.locator(".notes-note-crumbs")).toContainText(parentTitle);

    // Im Baum hat die Elternseite jetzt einen echten Aufklapp-Pfeil.
    const parentRow = page
      .locator(".notes-sidebar .notes-tree-row")
      .filter({ hasText: parentTitle })
      .first();
    await expect(parentRow.locator("button.notes-tree-toggle")).toBeVisible();

    // Zurück zur Elternseite: Der Verweis steht im Text und öffnet die Unterseite.
    await page.locator(".notes-note-crumbs").getByRole("button", { name: parentTitle }).click();
    const mention = page.locator(".note-mention").first();
    await expect(mention).toBeVisible();
    await mention.getByRole("button").click();
    await expect(page.getByLabel("Notiztitel")).toHaveValue(defaultTitlePattern);
    await expect(page.locator(".notes-note-crumbs")).toContainText(parentTitle);
  });

  test("zeigt einen Konflikt an und behält die eigene Fassung", async ({ page, request }) => {
    await openNotes(page);
    await createPage(page);
    const conflictTitle = `Konflikt-Test ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("Notiztitel").fill(conflictTitle);
    await page.getByLabel("Notiztitel").blur();
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    await editor.pressSequentially("Erste Fassung");
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");

    // Fremdänderung über die API (andere Sitzung).
    const origin = new URL(workbenchUrl).origin;
    const headers = { "tailscale-user-login": login };
    const list = await (await request.get(`${origin}/api/v1/notes`, { headers })).json();
    const target = list.notes.find((note: { title: string }) => note.title === conflictTitle);
    expect(target).toBeTruthy();
    await expect.poll(async () => {
      const response = await request.get(`${origin}/api/v1/notes/${target.id}`, { headers });
      return ((await response.json()) as { note: { content: string } }).note.content;
    }).toContain("Erste Fassung");
    const detail = await (await request.get(`${origin}/api/v1/notes/${target.id}`, { headers })).json();
    const saved = await request.put(`${origin}/api/v1/notes/${target.id}/content`, {
      headers,
      data: { content: "Fassung vom anderen Gerät", expectedRevision: detail.note.revision },
    });
    expect((await saved.json()).status).toBe("saved");

    // Weiter tippen: Der Autosave läuft in den Konflikt.
    await editor.pressSequentially(" mit Nachtrag");
    await expect(page.locator(".note-conflict")).toBeVisible();

    await page.getByRole("button", { name: "Meine Fassung behalten" }).click();
    await expect(page.locator(".note-conflict")).toHaveCount(0);
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
  });

  test("verweigert das Speichern mit veralteter Revision, ohne Inhalt zu verlieren", async ({ request }) => {
    const origin = new URL(workbenchUrl).origin;
    const headers = { "tailscale-user-login": login };
    const created = await request.post(`${origin}/api/v1/notes`, {
      headers,
      data: { title: "Konflikt-Test" },
    });
    expect(created.ok()).toBe(true);
    const note = (await created.json()).note as { id: string; revision: number };

    const first = await request.put(`${origin}/api/v1/notes/${note.id}/content`, {
      headers,
      data: { content: "Erste Fassung", expectedRevision: note.revision },
    });
    expect(first.ok()).toBe(true);
    expect((await first.json()).status).toBe("saved");

    const conflict = await request.put(`${origin}/api/v1/notes/${note.id}/content`, {
      headers,
      data: { content: "Veraltete Fassung", expectedRevision: note.revision },
    });
    expect(conflict.ok()).toBe(true);
    const payload = await conflict.json();
    expect(payload.status).toBe("conflict");
    expect(payload.note.content).toBe("Erste Fassung");
  });
});
