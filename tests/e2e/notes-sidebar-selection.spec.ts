import { expect, test } from "@playwright/test";
import { apiIdentityHeaders, workbenchUrl } from "./helpers/environment";

const headers = apiIdentityHeaders("user@example.com");
test.use({ extraHTTPHeaders: headers, viewport: { width: 1440, height: 960 } });

for (const collection of [false, true]) {
  test(`Favoriten lassen ${collection ? "Sammlung" : "Eingang"} eingeklappt, auch nach Neuladen`, async ({ page, request }) => {
    const title = `Favorit ${Date.now()}`;
    const folderId = collection
      ? (await (await request.post("/api/v1/notes/folders", { headers, data: { name: `Sammlung ${Date.now()}` } })).json()).folder.id
      : null;
    const create = async (name: string, favorite: boolean) => (await (await request.post("/api/v1/notes", {
      headers, data: { title: name, favorite, folderId },
    })).json()).note;
    const favorite = await create(title, true);
    const other = await create(`Andere Seite ${Date.now()}`, false);
    await page.goto(`${workbenchUrl}/notizen?note=${other.id}`);
    await expect(page.getByLabel("Notiztitel")).toHaveValue(other.title);
    const section = page.locator(`[data-section="${collection ? `folder:${folderId}` : "all"}"]`);
    const toggle = section.locator(".notes-group-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.locator('[data-section="favorites"]').getByRole("button", { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`note=${favorite.id}`));
    await expect(page.getByLabel("Notiztitel")).toHaveValue(title);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await page.reload();
    await expect(page.getByLabel("Notiztitel")).toHaveValue(title);
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    // Bei einem Suchtreffer ohne sichtbaren Favoriten bleibt die Pfadöffnung erhalten.
    await page.locator(".notes-search-row").click();
    await page.getByRole("textbox", { name: "Notizen durchsuchen" }).fill(other.title);
    await page.getByRole("option", { name: new RegExp(other.title) }).click();
    await expect(page.getByLabel("Notiztitel")).toHaveValue(other.title);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
}
