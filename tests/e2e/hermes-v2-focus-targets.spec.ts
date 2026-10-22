import { expect, type Locator } from "@playwright/test";
import { composerTest as test, prepareComposer, openComposer, composerInput,
  mutationCalls } from "./hermes-v2-composer-fixture";

test.use({ extraHTTPHeaders: { "tailscale-user-login": "user@example.com" } });
test.beforeEach(({ gateway }) => prepareComposer(gateway));

async function fullHitTarget(name: string, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();
  const hit = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    let top = Math.max(0, box.top), bottom = Math.min(innerHeight, box.bottom);
    let left = Math.max(0, box.left), right = Math.min(innerWidth, box.right);
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent), clip = parent.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
        top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
      }
      if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
        left = Math.max(left, clip.left); right = Math.min(right, clip.right);
      }
    }
    const center = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
    return { width: right - left, height: bottom - top,
      actual: center !== null && element.contains(center) };
  });
  expect(hit.width, `${name}: Breite`).toBeGreaterThanOrEqual(44);
  expect(hit.height, `${name}: Höhe`).toBeGreaterThanOrEqual(44);
  expect(hit.actual, `${name}: erreichbar`).toBe(true);
}

for (const width of [1440, 1024]) {
  test(`behält volle Sidebar- und Composerziele bei ${width}px`, async ({ page, gateway }) => {
    await page.setViewportSize({ width, height: 900 });
    await openComposer(page);
    for (const [name, target] of [
      ["Neuer Chat", page.getByRole("button", { name: "Neuer Chat", exact: true })],
      ["Sitzungszeile", page.locator(".hermesv2-rowselect").first()],
      ["Denktiefe", page.getByRole("button", { name: "Denktiefe", exact: true })],
      ["Datei anhängen", page.getByRole("button", { name: "Datei anhängen", exact: true })],
    ] as const) await fullHitTarget(name, target);
    expect(mutationCalls(gateway, "message.submit")).toHaveLength(0);
  });
}

for (const width of [1440, 390]) {
  for (const close of ["Escape", "Schließen"] as const) {
    test(`kehrt nach Hilfe über ${close} bei ${width}px zur Eingabe zurück`, async ({ page, gateway }) => {
      await page.setViewportSize({ width, height: 844 });
      await openComposer(page);
      const input = composerInput(page);
      await input.fill("/help");
      await input.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Hilfe: Hermes-Befehle", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Schließen", exact: true })).toBeFocused();
      if (close === "Escape") await page.keyboard.press("Escape");
      else await dialog.getByRole("button", { name: "Schließen", exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(input).toBeFocused();
      await page.keyboard.type("Eigener Entwurf");
      await page.keyboard.press("Shift+Enter");
      await page.keyboard.type("Zweite Zeile");
      await expect(input).toHaveValue("Eigener Entwurf\nZweite Zeile");
      expect(mutationCalls(gateway, "message.submit")).toHaveLength(0);
    });
  }
}
