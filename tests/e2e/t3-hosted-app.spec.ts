import { expect, test } from "@playwright/test";

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
  // Der Proxy braucht ein laufendes T3-Backend. Im isolierten E2E-Lauf ist
  // T3_CLI_PATH=/bin/false, dann liefert /t3 nur die Fehlerhülle. Den Inhalt
  // nur prüfen, wenn das Backend wirklich HTML ausliefert.
  const probe = await page.request.get("/t3");
  const probeBody = await probe.text();
  test.skip(
    !probe.ok() || !probeBody.toLowerCase().includes("<!doctype html"),
    "Kein T3-Backend im E2E-Lauf, nur die Proxy-Verdrahtung ist prüfbar.",
  );
  await expect(proxiedApp.locator("body")).toContainText(/T3 Code|Connect an environment/i, { timeout: 30_000 });
});

test("zeigt T3 Code ohne Shell-Topbar über die volle Höhe", async ({ page }) => {
  await page.goto("/wrapt/t3-code");
  await expect(page.locator(".topbar")).toHaveCount(0);
  await expect(page.locator("#topbar-tool-actions")).toHaveCount(0);
  await expect(page.locator(".status-bar")).toBeVisible();
});
