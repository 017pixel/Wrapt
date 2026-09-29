import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });

test("leitet /workbench beim echten Laden samt Query, Hash und Browserverlauf auf /orbit um", async ({ page }) => {
  await page.goto("/wrapt/orbit");
  await expect(page.locator(".orbit-page")).toBeVisible();

  await page.goto("/wrapt/workbench?projekt=chappie#knoten");
  await expect(page).toHaveURL(/\/wrapt\/orbit\?projekt=chappie#knoten$/);
  await expect(page.locator(".orbit-page")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/wrapt\/orbit\?projekt=chappie#knoten$/);
  await expect(page.locator(".orbit-page")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/wrapt\/orbit$/);
  await expect(page.locator(".orbit-page")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/wrapt\/orbit\?projekt=chappie#knoten$/);
  await expect(page.locator(".orbit-page")).toBeVisible();
});
