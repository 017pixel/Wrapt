import { expect, test } from "@playwright/test";

// `WRAPT_E2E_URL` zeigt auf den Origin des Testservers; die Wrapt
// selbst wird unter dem `/workbench`-Basispfad ausgeliefert.
const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
});

test("verwaltet Extensions über den lokalen Catalog mit fail-closed Runtime", async ({ page }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  await page.goto(`${workbench}/settings`);
  await page.getByRole("button", { name: "Erweiterungen", exact: true }).click();

  const extensionsCard = page.locator(".page-frame").getByRole("heading", { name: "Extensions" });
  await expect(extensionsCard).toBeVisible();

  // Retries teilen sich den Testserver: Eine vom ersten Lauf installierte
  // Extension wird vorab entfernt, damit der Ablauf immer frisch startet.
  await page.getByRole("button", { name: /Installiert/ }).click();
  const leftoverRow = page.locator(".extension-row", { hasText: "Demo Uhr" });
  if (await leftoverRow.count()) {
    await leftoverRow.getByRole("button", { name: /Deinstallieren/ }).click();
    await page.getByRole("dialog", { name: /deinstallieren/ }).getByRole("button", { name: "Deinstallieren" }).click();
    await expect(leftoverRow).not.toBeVisible();
  }
  await page.getByRole("button", { name: /Entdecken/ }).click();

  // Der Catalog enthält die Demo-Fixture; die Extension ist noch nicht installiert.
  const demoRow = page.locator(".extension-row", { hasText: "Demo Uhr" });
  await expect(demoRow).toBeVisible();
  await expect(demoRow.getByRole("button", { name: /Installieren/ })).toBeVisible();

  // Installation fordert die Permission an — der Review-Dialog erscheint.
  await demoRow.getByRole("button", { name: /Installieren/ }).click();
  const reviewDialog = page.getByRole("dialog", { name: /Berechtigungen für Demo Uhr/ });
  await expect(reviewDialog).toBeVisible();
  await expect(reviewDialog).toContainText("Benachrichtigungen senden");

  // Die Permission-Freigabe installiert die Extension; die Catalog-Runtime
  // bleibt bis zum verifizierten Entrypoint-Host fail-closed deaktiviert.
  await reviewDialog.getByRole("button", { name: "Alle freigeben" }).click();
  await expect(reviewDialog).not.toBeVisible();
  const catalogRow = page.locator(".extension-row", { hasText: "Demo Uhr" });
  await expect(catalogRow.getByText("Installiert", { exact: true })).toBeVisible();
  await expect(catalogRow.getByRole("switch")).toHaveCount(0);

  // Der Installierte-Tab zeigt denselben Zustand ohne Aktivierungsaktion.
  await page.getByRole("button", { name: /Installiert/ }).click();
  const installedRow = page.locator(".extension-row", { hasText: "Demo Uhr" });
  await expect(installedRow.getByText("Installiert", { exact: true })).toBeVisible();
  await expect(installedRow.getByRole("switch", { name: /Aktivieren: Demo Uhr/ })).toBeDisabled();

  // Deinstallieren mit Bestätigung entfernt die Extension aus der Registry.
  await installedRow.getByRole("button", { name: /Deinstallieren/ }).click();
  const confirmDialog = page.getByRole("dialog", { name: /deinstallieren/ });
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Deinstallieren" }).click();
  await expect(page.locator(".extension-row", { hasText: "Demo Uhr" })).not.toBeVisible();
});
