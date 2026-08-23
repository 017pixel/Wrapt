import { expect, test } from "@playwright/test";

const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("installiert, öffnet, verwaltet und entfernt eine Werkzeugseite end-to-end", async ({ page }) => {
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
  await expect(page.getByRole("link", { name: "Wrapt neu starten" })).toBeVisible();

  await page.reload();
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installierte Plugins", exact: true }).click();
  const installedRow = page.locator(".plugins-installed-row", { hasText: "Fokus-Timer" });
  await expect(installedRow).toBeVisible();
  await expect(installedRow.getByRole("button", { name: "Fokus-Timer bearbeiten" })).toBeVisible();
  await expect(installedRow.getByRole("button", { name: "Fokus-Timer deaktivieren" })).toBeVisible();
  await expect(installedRow.getByRole("button", { name: "Fokus-Timer deinstallieren" })).toBeVisible();
  const installedActionCenters = await installedRow.locator(".plugins-installed-actions > *").evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()).map(({ y, height }) => y + height / 2));
  expect(Math.max(...installedActionCenters) - Math.min(...installedActionCenters)).toBeLessThan(4);
  expect((await installedRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(68);

  await installedRow.getByRole("button", { name: "Fokus-Timer bearbeiten" }).click();
  await expect(page.getByRole("dialog", { name: "Plugin bearbeiten" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Visuell bearbeiten/i })).toBeVisible();
  await page.getByRole("button", { name: /Visuell bearbeiten/i }).click();
  await expect(page).toHaveURL(/\/plugins\/maker\?draft=.*&mode=visual&edit=1$/);
  await expect(page.getByRole("heading", { name: "Plugin bearbeiten" })).toBeVisible();
  await page.goto(`${workbench}/plugins`);
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Eigene Plugins", exact: true }).click();
  const copiedDraft = page.locator(".plugin-draft-card", { hasText: "Fokus-Timer Kopie" });
  await expect(copiedDraft).toBeVisible();
  await copiedDraft.getByRole("button", { name: /löschen/i }).click();
  await page.getByRole("dialog", { name: /löschen/i }).getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(copiedDraft).not.toBeVisible();
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installierte Plugins", exact: true }).click();

  await expect(page.locator("aside").getByRole("link", { name: "Fokus-Timer" })).toBeVisible({ timeout: 15_000 });
  await page.locator("aside").getByRole("link", { name: "Fokus-Timer" }).click();
  await expect(page).toHaveURL(/\/plugins\/tool\/focus-timer$/);
  await expect(page.getByRole("heading", { name: "Fokus-Timer" })).toBeVisible();
  await expect(page.getByText("25:00")).toBeVisible();
  await page.getByRole("button", { name: "Timer starten" }).click();
  await expect(page.getByText("Fokus-Block läuft.")).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("24:59", { timeout: 2_000 });

  const pluginsLink = page.locator("aside").getByRole("link", { name: "Plugins", exact: true });
  await expect(pluginsLink).not.toHaveAttribute("aria-current", "page");
  await expect(page.locator("aside").getByRole("link", { name: "Fokus-Timer" })).toHaveAttribute("aria-current", "page");

  await page.goto(`${workbench}/plugins`);
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installierte Plugins", exact: true }).click();
  await installedRow.getByRole("button", { name: "Fokus-Timer deaktivieren" }).click();
  await expect(installedRow.getByText("Deaktiviert", { exact: true })).toBeVisible();
  await expect(page.locator("aside").getByRole("link", { name: "Fokus-Timer" })).toHaveCount(0, { timeout: 15_000 });

  await installedRow.getByRole("button", { name: "Fokus-Timer aktivieren" }).click();
  await expect(installedRow.getByText("Aktiv", { exact: true })).toBeVisible();
  await installedRow.getByRole("button", { name: "Fokus-Timer deinstallieren" }).click();
  await page.getByRole("dialog", { name: /deinstallieren/i }).getByRole("button", { name: "Deinstallieren" }).click();
  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installieren", exact: true }).click();
  await expect(card.getByRole("button", { name: "Installieren", exact: true })).toBeVisible();
  await expect(page.locator("aside").getByRole("link", { name: "Fokus-Timer" })).toHaveCount(0, { timeout: 15_000 });
});
