import { expect, test } from "@playwright/test";

test.use({
  extraHTTPHeaders: { "tailscale-user-login": "user@example.com" },
  viewport: { width: 1440, height: 960 },
  hasTouch: true,
});

test("zeigt Orbit-Info auf Desktop per Fokus und auf Touch per Sheet", async ({ page }) => {
  await page.goto("/wrapt/orbit");
  await expect(page.locator(".orbit-page")).toBeVisible();
  const trigger = page.getByRole("button", { name: "Orbit-Information öffnen" });
  await trigger.focus();
  await expect(page.getByLabel("Orbit-Kurzinfo")).toBeVisible();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Arbeitsbereich-Info" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Arbeitsbereich-Info" })).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const triggerBounds = await trigger.boundingBox();
  expect(triggerBounds).not.toBeNull();
  await page.touchscreen.tap(triggerBounds!.x + triggerBounds!.width / 2, triggerBounds!.y + triggerBounds!.height / 2);
  await expect(page.getByLabel("Orbit-Kurzinfo")).toBeVisible();
  await page.getByRole("button", { name: "Details ansehen" }).click();
  const details = page.getByRole("dialog", { name: "Arbeitsbereich-Info" });
  await expect(details).toBeVisible();
  await expect(details).toContainText("Asynchroner Serverabgleich");
  await page.keyboard.press("Escape");
  await expect(details).toHaveCount(0);
});
