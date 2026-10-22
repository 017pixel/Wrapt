import { expect, test } from "@playwright/test";
import { apiIdentityHeaders, e2eOrigin, workbenchUrl } from "./helpers/environment";

test.use({ serviceWorkers: "block", extraHTTPHeaders: apiIdentityHeaders("user@example.com") });

test("erstellt, bearbeitet und aktiviert ein Code-Plugin mit dauerhaftem Datensatz", async ({ page }) => {
  test.setTimeout(120_000);
  const id = `personal.e2e${Date.now()}`;
  const name = "Testjournal";
  const endpoint = `${e2eOrigin}/api/v1/plugins/code/${id}`;
  try {
    await page.goto(`${workbenchUrl}/plugins#plugins:code`);
    const area = page.getByRole("region", { name: "Lokale Code-Plugins" });
    await expect(area).toBeVisible();
    await area.getByLabel("Name", { exact: true }).fill(name);
    await area.getByLabel("Plugin-ID", { exact: true }).fill(id);
    await area.getByRole("button", { name: "Code-Plugin erstellen", exact: true }).click();
    await area.getByRole("combobox", { name: "Datei", exact: true }).selectOption("server.ts");
    const source = area.getByRole("textbox", { name: "Quellcode server.ts" });
    await expect(source).toBeVisible();
    await source.fill((await source.inputValue()) + "\n// E2E-Änderung\n");
    page.once("dialog", (dialog) => dialog.dismiss());
    await area.getByRole("button", { name: "Editor schließen" }).click();
    await expect(source).toBeVisible();
    await area.getByRole("button", { name: "Quellen speichern" }).click();
    await expect(area.getByRole("button", { name: "Quellen speichern" })).toBeDisabled();
    const row = area.locator("article", { has: page.getByRole("heading", { name, exact: true }) });
    await row.getByRole("button", { name: "Bauen", exact: true }).click();
    await expect(row).not.toContainText("Build fehlt", { timeout: 30_000 });
    await row.getByRole("button", { name: "Aktivieren", exact: true }).click();
    await page.getByRole("dialog", { name: "Code-Plugin vertrauen?" }).getByRole("button", { name: "Vertrauen und aktivieren" }).click();
    await expect(row).toContainText("Aktiv · 0.1.0", { timeout: 30_000 });
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
    await page.getByLabel("Eintrag", { exact: true }).fill("Bleibt nach dem Neuladen");
    await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Bleibt nach dem Neuladen" })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Bleibt nach dem Neuladen", { exact: true })).toBeVisible();
  } finally {
    await page.request.delete(endpoint, { headers: apiIdentityHeaders("user@example.com") });
  }
});
