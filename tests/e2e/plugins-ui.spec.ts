import { expect, test } from "@playwright/test";

const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("aktiviert ein verifiziertes Catalog-Plugin und entfernt es wieder", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/plugins`);

  await expect(page.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installierte Plugins", exact: true })).toBeVisible();
  await expect(page.getByText("Lifecycle")).toHaveCount(0);

  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installieren", exact: true }).click();
  const card = page.locator(".plugin-store-card", { hasText: "Fokus-Timer" });
  await expect(card).toBeVisible();
  const install = card.getByRole("button", { name: "Installieren", exact: true });
  if (await install.count()) {
    await install.click();
  }
  await expect(card.getByText("Aktiv", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Deaktivieren", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Wrapt neu starten" })).toHaveCount(0);

  await page.reload();
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installierte Plugins", exact: true }).click();
  const installedRow = page.locator(".plugins-installed-row", { hasText: "Fokus-Timer" });
  await expect(installedRow).toBeVisible();
  await expect(installedRow.getByRole("button", { name: "Fokus-Timer bearbeiten" })).toBeVisible();
  await expect(installedRow.getByRole("link", { name: "Seite öffnen" })).toBeVisible();
  await expect(installedRow.getByRole("button", { name: "Fokus-Timer deinstallieren" })).toBeVisible();
  const installedActionCenters = await installedRow.locator(".plugins-installed-actions > *").evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()).map(({ y, height }) => y + height / 2));
  expect(Math.max(...installedActionCenters) - Math.min(...installedActionCenters)).toBeLessThan(4);
  expect((await installedRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(68);

  await installedRow.getByRole("button", { name: "Fokus-Timer deinstallieren" }).click();
  await page.getByRole("dialog", { name: /deinstallieren/i }).getByRole("button", { name: "Deinstallieren" }).click();
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installieren", exact: true }).click();
  await expect(card.getByRole("button", { name: "Installieren", exact: true })).toBeVisible();
  await expect(page.locator("aside").getByRole("link", { name: "Fokus-Timer" })).toHaveCount(0, { timeout: 15_000 });
});
