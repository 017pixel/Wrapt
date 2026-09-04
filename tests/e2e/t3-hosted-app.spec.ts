import { expect, test } from "@playwright/test";

const channel = process.env.WRAPT_E2E_T3_CHANNEL === "nightly" ? "nightly" : "stable";
const expectedOrigin = channel === "nightly"
  ? "https://nightly.app.t3.codes"
  : "https://app.t3.codes";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" },
  serviceWorkers: "block",
});

test("bettet T3 same-origin über den /t3-Proxy ein", async ({ page }) => {
  const response = await page.goto("/wrapt/t3-code");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["permissions-policy"]).toContain("local-network-access=(");

  const frame = page.locator('iframe[title="T3 Code"]');
  await expect(frame).toBeVisible({ timeout: 15_000 });
  // Same-origin-Proxy statt Hosted-Origin: Nur so kann die Route-Bridge
  // Zurück im iframe abfangen und T3-intern navigieren.
  await expect(frame).toHaveAttribute("src", "/t3");
  await expect(frame).toHaveAttribute(
    "allow",
    "local-network-access; local-network; loopback-network",
  );

  const proxiedApp = page.frameLocator('iframe[title="T3 Code"]');
  await expect(proxiedApp.locator("body")).toContainText(/T3 Code|Connect an environment/i, { timeout: 30_000 });
});

test("öffnet Extern auf der gehosteten App des konfigurierten Kanals", async ({ page }) => {
  await page.goto("/wrapt/t3-code");
  await page.locator("#topbar-tool-actions button[aria-label='Werkzeugaktionen']").click();
  await expect(page.getByRole("menuitem", { name: "In neuem Tab öffnen" })).toHaveAttribute("href", expectedOrigin);
});
