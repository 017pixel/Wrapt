import { expect, test } from "@playwright/test";

const workbench = process.env.WRAPT_E2E_URL
  ? `${process.env.WRAPT_E2E_URL.replace(/\/$/, "")}/wrapt`
  : undefined;

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
});

test("installiert mein-plugin und zeigt die Hello-World-Seite auf Desktop und Mobil", async ({ page, browserName, context }) => {
  test.skip(!workbench, "Set WRAPT_E2E_URL to an isolated Wrapt test server.");
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  }

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto(`${workbench}/plugins`);
  await expect(page.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Plugin-Bereiche" }).getByRole("button", { name: "Installieren", exact: true }).click();
  const card = page.locator(".plugin-store-card", { hasText: "Mein erstes Plugin" });
  await expect(card).toBeVisible();
  await expect(card).toContainText("Eine erste eigene Wrapt-Seite.");
  const install = card.getByRole("button", { name: "Installieren", exact: true });
  if (await install.count()) {
    await install.click();
    await expect(card.getByText("Aktiv", { exact: true })).toBeVisible();
  }

  const sidebarLink = page.locator("aside").getByRole("link", { name: "Mein erstes Plugin" });
  await expect(sidebarLink).toBeVisible({ timeout: 15_000 });
  await sidebarLink.click();
  await expect(page).toHaveURL(/\/plugins\/tool\/mein-plugin$/);
  await expect(page.getByRole("heading", { name: "Mein erstes Plugin" })).toBeVisible();
  await expect(page.getByText("Hallo Wrapt")).toBeVisible();
  await expect(page.getByRole("region", { name: "Plugin-Vorschau" }).locator(".plugin-preview-bar code"))
    .toHaveText("/plugins/tool/mein-plugin");

  const copyAction = page.getByRole("button", { name: "Begrüßung kopieren" });
  await expect(copyAction).toBeVisible();
  await copyAction.click();
  await expect(page.getByText("Text wurde kopiert.")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${workbench}/plugins/tool/mein-plugin`);
  await expect(page.getByRole("heading", { name: "Mein erstes Plugin" })).toBeVisible();
  await expect(page.getByText("Hallo Wrapt")).toBeVisible();
});
