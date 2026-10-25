import { expect, test } from "@playwright/test";
import { workbenchUrl } from "./helpers/environment";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test("erhält Editor-Dokument, Zielordner und ungespeicherte Eingaben bei interner Navigation", async ({ page }) => {
  let starts = 0;
  await page.route("**/api/v1/services", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    for (const service of data.services) if (service.id === "code-server") { service.state = "active"; service.mode = "embedded"; }
    await route.fulfill({ response, json: data });
  });
  // Eigener Test-Editor, keine Verbindung zum persönlichen VS-Code-Profil.
  await page.route("**/editor/?**", async (route) => {
    starts++;
    await route.fulfill({ contentType: "text/html", body: '<!doctype html><html><body><label>Datei<input aria-label="Datei" /></label></body></html>' });
  });
  await page.goto(`${workbenchUrl}/code-editor?folder=%2Ftmp%2Feditor-fixture`);
  const editor = page.frameLocator('iframe[title="Editor"]');
  await editor.getByRole("textbox", { name: "Datei" }).fill("Ungespeicherte Änderung");
  const initial = await page.locator('iframe[title="Editor"]').getAttribute("src");
  await page.locator('a[href$="/projects"]').first().click();
  await page.locator('a[href$="/code-editor"]').first().click();
  await expect(editor.getByRole("textbox", { name: "Datei" })).toHaveValue("Ungespeicherte Änderung");
  await expect(page.locator('iframe[title="Editor"]')).toHaveAttribute("src", initial!);
  expect(starts).toBe(1);
});
