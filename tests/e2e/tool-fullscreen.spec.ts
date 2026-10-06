import { expect, test } from "@playwright/test";
import { workbenchUrl } from "./helpers/environment";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" }, viewport: { width: 1280, height: 800 } });
test("Vollbild über das Werkzeugmenü hält Wiederherstellen und Menü nebeneinander", async ({ page }) => {
  await page.route("**/t3/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html lang='de'><body>Testwerkzeug</body></html>" }));
  await page.route("https://app.t3.codes/**", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><html lang='de'><body>Testwerkzeug</body></html>" }));
  await page.goto(`${workbenchUrl}/t3-code`);
  await page.getByRole("button", { name: "Werkzeugaktionen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Vollbild", exact: true }).click();
  const restore = page.getByRole("button", { name: "Wiederherstellen", exact: true });
  const menu = page.getByRole("button", { name: "Werkzeugaktionen", exact: true });
  await expect(restore).toBeVisible();
  const a = await restore.boundingBox(), b = await menu.boundingBox();
  expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x);
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(5);
  await restore.click();
  await expect(restore).toHaveCount(0);
});
