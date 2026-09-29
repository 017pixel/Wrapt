import { expect, test, type Page } from "@playwright/test";
import { workbenchUrl } from "./helpers/environment";

const login = "user@example.com";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": login },
  viewport: { width: 1440, height: 960 },
});

async function openNotes(page: Page) {
  await page.goto(`${workbenchUrl}/notizen`);
  await expect(page.locator(".notes-workspace")).toBeVisible();
}

async function createPage(page: Page, title: string, content?: string) {
  await page.locator(".notes-sidebar .notes-sidebar-new").click();
  await expect(page.getByLabel("Notiztitel")).toHaveValue(/^Notiz – /, { timeout: 10000 });
  await page.getByLabel("Notiztitel").fill(title);
  await page.getByLabel("Notiztitel").blur();
  if (content !== undefined) {
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    await editor.pressSequentially(content);
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");
  }
}

function palette(page: Page) {
  return page.locator(".notes-palette");
}

test.describe("Notizen-Suche (⌘K)", () => {
  test("öffnet die Palette, zeigt Treffer mit Vorschau und öffnet per Enter", async ({ page }) => {
    await openNotes(page);
    const stamp = Date.now().toString().slice(-6);
    const alpha = `Suche Alpha ${stamp}`;
    await createPage(page, alpha, "Zebrastreifen im Inhalt");
    await createPage(page, `Suche Beta ${stamp}`);

    await page.keyboard.press("ControlOrMeta+k");
    const dialog = palette(page);
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Notizen durchsuchen").fill("Zebrastreifen");
    await expect(dialog.getByRole("option", { name: new RegExp(alpha) })).toBeVisible();
    await expect(dialog.locator(".notes-palette-preview-title")).toHaveText(alpha);
    await expect(dialog.locator(".notes-palette-preview-excerpt")).toContainText("Zebrastreifen");

    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel("Notiztitel")).toHaveValue(alpha);
  });

  test("filtert nach Titel, Bereich und Datum", async ({ page }) => {
    await openNotes(page);
    const stamp = Date.now().toString().slice(-6);
    const alpha = `Filter Alpha ${stamp}`;
    await createPage(page, alpha, "Findbarer Inhalt");
    await createPage(page, `Filter Beta ${stamp}`);

    await page.keyboard.press("ControlOrMeta+k");
    const dialog = palette(page);
    await dialog.getByLabel("Notizen durchsuchen").fill("Findbarer");

    // Ohne Filter wird der Inhalt durchsucht.
    await expect(dialog.getByRole("option", { name: new RegExp(alpha) })).toBeVisible();

    // „Nur Titel durchsuchen“ blendet Inhaltstreffer aus.
    await dialog.getByRole("button", { name: /Nur Titel durchsuchen/ }).click();
    await expect(dialog.getByText(/Keine Treffer/)).toBeVisible();
    await dialog.getByRole("button", { name: /Nur Titel durchsuchen/ }).click();
    await expect(dialog.getByRole("option", { name: new RegExp(alpha) })).toBeVisible();

    // Bereich: Nur innerhalb der eigenen Seite.
    await dialog.getByRole("button", { name: "Auf Seiten", exact: true }).click();
    await dialog.getByRole("menuitem", { name: alpha }).click();
    await dialog.getByLabel("Notizen durchsuchen").fill(`Filter Beta ${stamp}`);
    await expect(dialog.getByText(/Keine Treffer/)).toBeVisible();

    // Erstellungsdatum: „Heute“ schließt die frisch angelegte Seite ein.
    await dialog.getByRole("button", { name: "Erstellt", exact: true }).click();
    await dialog.getByRole("menuitem", { name: "Heute" }).click();
    await dialog.getByRole("button", { name: "Auf Seiten", exact: true }).click();
    await dialog.getByRole("menuitem", { name: "Überall" }).click();
    await expect(dialog.getByRole("option", { name: new RegExp(`Filter Beta ${stamp}`) })).toBeVisible();

    // Escape schließt die Palette.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });

  test("durchsucht Überschriften und gruppiert nach Datum", async ({ page }) => {
    await openNotes(page);
    const stamp = Date.now().toString().slice(-6);
    const title = `Überschrift ${stamp}`;
    await createPage(page, title, "## Abschnitt Planung");
    await expect(page.locator(".notes-save-state")).toHaveAttribute("data-state", "saved");

    await page.keyboard.press("ControlOrMeta+k");
    const dialog = palette(page);
    await dialog.getByLabel("Notizen durchsuchen").fill("Abschnitt Planung");

    await expect(dialog.getByRole("option", { name: new RegExp(title) })).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator(".notes-palette-group-title").first()).toHaveText("Heute");
    await expect(dialog.locator(".notes-palette-foot")).toContainText("Neues Fenster");
  });
});
