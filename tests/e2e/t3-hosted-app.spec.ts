import { expect, test } from "@playwright/test";

const channel = process.env.WRAPT_E2E_T3_CHANNEL === "nightly" ? "nightly" : "stable";
const expectedOrigin = channel === "nightly"
  ? "https://nightly.app.t3.codes"
  : "https://app.t3.codes";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" },
  serviceWorkers: "block",
});

test("bettet die Hosted-App des konfigurierten T3-Kanals ein", async ({ page }) => {
  const response = await page.goto("/wrapt/t3-code");
  expect(response?.status()).toBe(200);
  expect(response?.headers()["permissions-policy"]).toContain(`"${expectedOrigin}"`);

  const frame = page.locator('iframe[title="T3 Code"]');
  await expect(frame).toBeVisible({ timeout: 15_000 });
  // Browser-URL-Serialisierung entfernt den optionalen Root-Slash aus dem
  // Attribut. Die relevante Zusage ist deshalb die offizielle Origin.
  await expect(frame).toHaveAttribute("src", expectedOrigin);
  await expect(frame).toHaveAttribute(
    "allow",
    "local-network-access; local-network; loopback-network",
  );

  const hostedApp = page.frameLocator('iframe[title="T3 Code"]');
  await expect(hostedApp.locator("body")).toContainText(/T3 Code|Connect an environment/i, { timeout: 30_000 });
});
