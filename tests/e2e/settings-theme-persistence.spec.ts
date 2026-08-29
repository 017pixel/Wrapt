import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" },
  serviceWorkers: "block",
});

test("behält das aktive Theme beim Wechsel zwischen Einstellungs-Tabs", async ({ page }) => {
  await page.goto("/wrapt/settings");
  await page.getByRole("button", { name: "Design", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vorgefertigte Themes", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Ember", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ember", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Navigation", exact: true }).click();
  await expect(page.locator("#settings-navigation")).toBeVisible();
  await page.getByRole("button", { name: "Design", exact: true }).click();

  await expect(page.getByRole("button", { name: "Ember", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "T3 Code", exact: true })).toHaveAttribute("aria-pressed", "false");
});
