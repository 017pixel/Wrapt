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
  await page.locator(".notes-sidebar .notes-sidebar-new").click();
  const title = page.getByLabel("Notiztitel");
  await expect(title).toHaveValue(defaultTitlePattern, { timeout: 10000 });
  return (await title.inputValue()).trim();
}

test.describe("Notizen-Seitenleiste", () => {
  test("Notizfenster wechselt zu Unterseiten und bleibt auf schmalem Viewport bedienbar", async ({ page }) => {
    await openNotes(page);
    await createPage(page);
    const parentTitle = `Fenster ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("Notiztitel").fill(parentTitle);
    await page.getByLabel("Notiztitel").blur();
    await expect(page.locator(".notes-note-current")).toHaveText(parentTitle);

    const popupPromise = page.context().waitForEvent("page");
    await page.locator(".notes-note-head").getByRole("button", { name: "Weitere Aktionen" }).click();
    await page.getByRole("menuitem", { name: "In neuem Fenster öffnen" }).click();
    const popup = await popupPromise;
    await expect(popup.locator(".notes-workspace")).toBeVisible();
    await popup.setViewportSize({ width: 390, height: 844 });
    await expect(popup.getByLabel("Notiztitel")).toHaveValue(parentTitle);

    const parentUrl = popup.url();
    await popup.getByRole("button", { name: "Unterseite erstellen" }).click();
    await expect.poll(() => popup.url()).not.toBe(parentUrl);
    await expect(popup.getByRole("navigation", { name: "Pfad" })).toContainText(parentTitle);
    const childUrl = popup.url();

    await popup.getByRole("navigation", { name: "Pfad" }).getByRole("button", { name: parentTitle }).click();
    await expect.poll(() => popup.url()).toBe(parentUrl);

    const mobileLayout = await popup.evaluate(() => {
      const editor = document.querySelector<HTMLElement>(".notes-editor-scroll");
      const frame = document.querySelector<HTMLElement>(".notes-editor-frame");
      return {
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        editorWidth: editor?.clientWidth ?? 0,
        editorScrollWidth: editor?.scrollWidth ?? 0,
        frameWidth: frame?.getBoundingClientRect().width ?? 0,
      };
    });
    expect(mobileLayout.documentWidth).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
    expect(mobileLayout.editorScrollWidth).toBeLessThanOrEqual(mobileLayout.editorWidth + 1);
    expect(mobileLayout.frameWidth).toBeLessThanOrEqual(mobileLayout.editorWidth + 1);
    await expect(popup.getByLabel("Notiztitel")).toBeVisible();
    expect(childUrl).not.toBe(parentUrl);
    await popup.close();
  });

  test("setzt Favoriten und stellt aus dem Papierkorb wieder her", async ({ page }) => {
    await openNotes(page);
    await createPage(page);
    const noteTitle = `Favorit ${Date.now().toString().slice(-6)}`;
    await page.getByLabel("Notiztitel").fill(noteTitle);
    await page.getByLabel("Notiztitel").blur();
    await expect(page.locator(".notes-note-current")).toHaveText(noteTitle);

    await page.locator(".notes-note-head").getByRole("button", { name: "Als Favorit markieren" }).click();
    await expect(
      page
        .locator(".notes-group")
        .filter({ hasText: "Favoriten" })
        .getByRole("button", { name: noteTitle, exact: true }),
    ).toBeVisible();

    await page.locator(".notes-note-head").getByRole("button", { name: "Weitere Aktionen" }).click();
    await page.getByRole("menuitem", { name: "In den Papierkorb" }).click();

    const trashSection = page.locator(".notes-sidebar .notes-group").filter({ hasText: "Papierkorb" });
    await expect(trashSection).toBeVisible();
    await trashSection.getByRole("button", { name: /^Papierkorb/ }).click();

    const trashRow = trashSection.locator(".notes-sidebar-row").filter({ hasText: noteTitle }).first();
    await expect(trashRow).toBeVisible();
    await trashRow.getByRole("button", { name: `${noteTitle} wiederherstellen` }).click();

    // Die eigene Seite ist zurück im Baum und aus dem Papierkorb verschwunden.
    await expect(trashSection.locator(".notes-sidebar-row").filter({ hasText: noteTitle })).toHaveCount(0);
    await expect(
      page.locator(".notes-sidebar .notes-tree-row").filter({ hasText: noteTitle }).first(),
    ).toBeVisible();
  });

  test("zieht die Breite und klappt die Seitenleiste ein", async ({ page }) => {
    await openNotes(page);
    await createPage(page);

    const sidebar = page.locator(".notes-sidebar");
    const before = await sidebar.boundingBox();
    expect(before).not.toBeNull();

    const resizer = page.locator(".notes-sidebar-resizer");
    const handle = await resizer.boundingBox();
    expect(handle).not.toBeNull();
    await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle!.x + handle!.width / 2 + 60, handle!.y + handle!.height / 2, {
      steps: 6,
    });
    await page.mouse.up();

    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(before!.width + 40);
    const after = await sidebar.boundingBox();
    expect(after!.width).toBeGreaterThan(before!.width + 40);

    // Die Breite überlebt einen Reload.
    await page.reload();
    await expect(page.locator(".notes-workspace")).toBeVisible();
    const persisted = await sidebar.boundingBox();
    expect(Math.abs(persisted!.width - after!.width)).toBeLessThan(4);

    // Einklappen und über die Kopfzeile wieder öffnen.
    await page.locator(".notes-sidebar-tools .notes-sidebar-collapse").click();
    await expect(sidebar).toHaveClass(/is-collapsed/);
    await expect(sidebar).toHaveAttribute("aria-hidden", "true");
    await page
      .locator(".notes-note-head")
      .getByRole("button", { name: "Seitenleiste öffnen" })
      .click();
    await expect(page.locator(".notes-sidebar")).toBeVisible();
  });

  test("wählt ein Material-Symbol statt eines Emojis", async ({ page }) => {
    await openNotes(page);
    await createPage(page);

    const iconButton = page.locator(".notes-title-icon");
    await expect(iconButton).toHaveAttribute("aria-label", "Symbol wählen");
    await iconButton.click();

    const picker = page.locator(".notes-icon-popover");
    await expect(picker).toBeVisible();
    await picker.getByLabel("Symbol suchen").fill("ordner");
    await picker.getByRole("button", { name: "Ordner", exact: true }).click();

    await expect(picker).toHaveCount(0);
    await expect(iconButton).toHaveAttribute("aria-label", "Symbol ändern");
    // Kein Emoji im UI: Das Symbol ist ein SVG ohne Textinhalt.
    expect((await iconButton.innerText()).trim()).toBe("");
    await expect(iconButton.locator("svg")).toHaveCount(1);
  });

  test("verschiebt eine Seite per Ziehen unter eine andere", async ({ page }) => {
    await openNotes(page);
    const stamp = Date.now().toString().slice(-6);
    const targetTitle = `Ziel ${stamp}`;
    const sourceTitle = `Quelle ${stamp}`;
    for (const title of [targetTitle, sourceTitle]) {
      await createPage(page);
      await page.getByLabel("Notiztitel").fill(title);
      await page.getByLabel("Notiztitel").blur();
      await expect(page.locator(".notes-note-current")).toHaveText(title);
    }

    const source = page
      .locator(".notes-sidebar .notes-tree-row")
      .filter({ hasText: sourceTitle })
      .first();
    const target = page
      .locator(".notes-sidebar .notes-tree-row")
      .filter({ hasText: targetTitle })
      .first();
    // Mittlerer Bereich der Zielzeile verschachtelt die Quelle darunter.
    await source.dragTo(target, { targetPosition: { x: 80, y: 14 } });

    await page.locator(".notes-sidebar .notes-tree-row").getByRole("button", { name: sourceTitle }).click();
    await expect(page.locator(".notes-note-crumbs")).toContainText(targetTitle);
  });

  test("verschiebt eine Seite über das Menü unter eine andere", async ({ page }) => {
    await openNotes(page);
    const stamp = Date.now().toString().slice(-6);
    const targetTitle = `M-Ziel ${stamp}`;
    const sourceTitle = `M-Quelle ${stamp}`;
    for (const title of [targetTitle, sourceTitle]) {
      await createPage(page);
      await page.getByLabel("Notiztitel").fill(title);
      await page.getByLabel("Notiztitel").blur();
      await expect(page.locator(".notes-note-current")).toHaveText(title);
    }

    // Die zuletzt erstellte Seite ist aktiv, ihre Zeilenaktionen sind sichtbar.
    await page
      .locator(".notes-sidebar .notes-tree-row.is-active")
      .getByRole("button", { name: "Seitenaktionen" })
      .click();
    await page.getByRole("menuitem", { name: "Verschieben nach …" }).click();

    const dialog = page.getByRole("dialog", { name: `${sourceTitle} verschieben` });
    await expect(dialog).toBeVisible();
    // Die Seite selbst ist kein Ziel, die Zielseite schon.
    await expect(dialog.locator(".notes-move-row").filter({ hasText: sourceTitle })).toHaveCount(0);
    await dialog.locator(".notes-move-row").filter({ hasText: targetTitle }).click();
    await expect(dialog).toHaveCount(0);

    await page.locator(".notes-sidebar .notes-tree-row").getByRole("button", { name: sourceTitle }).click();
    await expect(page.locator(".notes-note-crumbs")).toContainText(targetTitle);
  });

  test("Block-Menü öffnet nur per Klick und schließt bei Außenklick", async ({ page }) => {
    await openNotes(page);
    await createPage(page);
    const editor = page.locator(".notes-workspace .note-editor-content").first();
    await editor.click();
    await editor.pressSequentially("Erster Absatz");
    await editor.press("Enter");
    await editor.pressSequentially("Zweiter Absatz");

    const paragraphs = page.locator(".notes-workspace .note-editor-content p");
    await paragraphs.first().hover();
    // Nur Hover öffnet kein Menü (der gemeldete Bug).
    await expect(page.locator(".note-block-menu")).toHaveCount(0);

    await page.locator(".note-block-handle").click();
    const menu = page.locator(".note-block-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Umwandeln in")).toBeVisible();
    const firstBox = await menu.boundingBox();

    // Beim Hovern über einen anderen Absatz bleibt das Menü stehen.
    await paragraphs.nth(1).hover();
    const secondBox = await menu.boundingBox();
    expect(Math.abs(firstBox!.x - secondBox!.x)).toBeLessThan(2);
    expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThan(2);

    // Klick daneben schließt es.
    await page.locator(".notes-editor-frame").click({ position: { x: 8, y: 8 } });
    await expect(page.locator(".note-block-menu")).toHaveCount(0);
  });
});
