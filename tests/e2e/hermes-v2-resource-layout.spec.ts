import { expect, type Locator } from "@playwright/test";
import { resourceTest as test, prepareResources, openResources, selectArea, areaTab,
  type ResourceLabel } from "./hermes-v2-resource-fixture";
import { clickVisible, settleAnimations } from "./hermes-v2-work-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });
test.beforeEach(({ gateway }) => prepareResources(gateway));

async function assertVisibleTarget(target: Locator) {
  await expect(target).toBeVisible();
  const visible = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    let left = Math.max(box.left, 0), right = Math.min(box.right, innerWidth);
    let top = Math.max(box.top, 0), bottom = Math.min(box.bottom, innerHeight);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), rect = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, rect.left); right = Math.min(right, rect.right); }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, rect.top); bottom = Math.min(bottom, rect.bottom); }
    }
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    const scale = Number(getComputedStyle(element.closest(".hermesv2") ?? document.documentElement).zoom) || 1;
    return { minimum: 44 * scale, width: Math.max(0, right - left), height: Math.max(0, bottom - top), hit: hit === element || Boolean(hit && element.contains(hit)) };
  });
  expect(visible.width).toBeGreaterThanOrEqual(visible.minimum - .1);
  expect(visible.height).toBeGreaterThanOrEqual(visible.minimum - .1);
  expect(visible.hit).toBe(true);
}

for (const [width, height] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [390, 500], [450, 650]] as const) {
  test(`hält Ressourcen und Bereichsziele bei ${width}×${height} tatsächlich erreichbar`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openResources(page);
    await assertVisibleTarget(page.getByRole("button", { name: "Neuen Cron-Job erstellen", exact: true }));
    await assertVisibleTarget(page.getByRole("button", { name: "Cron aktualisieren", exact: true }));
    const names: ResourceLabel[] = ["Chat", "Cron", "Skills", "Memory", "Konfiguration", "Diagnose"];
    for (const name of names) {
      const target = areaTab(page, name);
      await settleAnimations(page);
      if (await target.isVisible()) {
        await assertVisibleTarget(target);
        await clickVisible(page, target);
        await expect(target).toHaveAttribute("aria-selected", "true");
      } else {
        await assertVisibleTarget(page.getByRole("tab", { name: "Weitere Hermes-Bereiche" }));
        await selectArea(page, name);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await selectArea(page, "Skills");
    const input = page.getByRole("searchbox", { name: /^Skills nach .*Name.*Slashbefehl suchen$/ });
    await assertVisibleTarget(input);
    expect(await input.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(16);
  });
}

test("bedient die Bereichsauswahl mit Pfeilen und Enter bei reduzierter Bewegung", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 500 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openResources(page, "Chat");
  await areaTab(page, "Chat").focus();
  await page.keyboard.press("ArrowRight");
  await expect(areaTab(page, "Cron")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(areaTab(page, "Cron")).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: "Weitere Hermes-Bereiche" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog", { name: "Weitere Bereiche" }).getByRole("button", { name: "Diagnose", exact: true }).click();
  await expect(page.locator("[data-hermes-ui='v2']")).toHaveAttribute("data-hermes-area", "diagnostics");
  await settleAnimations(page);
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
});

test("beendet Ressourcentraffic bei Flagoff aus einem zweiten eigenen Tab", async ({ page, context, gateway }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openResources(page);
  await expect(page.getByRole("button", { name: "Cron-Job: Eigener Prüfjob", exact: true })).toBeVisible();
  const settings = await context.newPage();
  try {
    await settings.goto("/wrapt/settings#einstellungen:experimente");
    const toggle = settings.getByRole("switch", { name: /Hermes V2 aktivieren/ });
    await expect(toggle).toBeChecked(); await toggle.click();
    await expect(areaTab(page, "Cron")).toHaveCount(0);
    await expect.poll(() => gateway.viewers.size).toBe(0);
    const count = gateway.resources.calls.length;
    gateway.resources.invalidate();
    expect(gateway.resources.calls).toHaveLength(count);
    expect(gateway.calls.filter((call) => call.op === "session.stop")).toHaveLength(0);
  } finally { await settings.close(); }
});
