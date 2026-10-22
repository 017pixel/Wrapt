import { expect, type Page } from "@playwright/test";
import { composerTest, prepareComposer, openComposer, composerInput } from "./hermes-v2-composer-fixture";
import { sessionId, otherId } from "./hermes-v2-request-fixture";
import type { HermesV2BrowserGateway } from "./hermes-v2-gateway";

export { composerTest as workTest, sessionId, otherId, composerInput };
export const workRegion = (page: Page) => page.getByRole("region", { name: "Aufgabenansicht", exact: true });
export const workRow = (page: Page, kind: string, text: string) =>
  page.locator(`[data-hermes-work-kind="${kind}"] > .hermesv2-work-summary`)
    .filter({ hasText: text }).locator("..");
export const workAction = (page: Page, action: string) => page.locator(`[data-hermes-work-action="${action}"]`);
/** Die Versandarten liegen im Überlaufmenü des Composers. */
export async function workMenuItem(page: Page, name: string) {
  const trigger = page.getByRole("button", { name: "Weitere Aktionen", exact: true });
  if (await trigger.getAttribute("aria-expanded") !== "true") await trigger.click();
  const item = page.getByRole("menuitem", { name, exact: true });
  await expect(item).toBeVisible();
  return item;
}

export async function runWorkAction(page: Page, name: string): Promise<void> {
  await (await workMenuItem(page, name)).click();
}

export function prepareWork(gateway: HermesV2BrowserGateway, running = false): void {
  prepareComposer(gateway);
  gateway.autoComplete = false;
  if (!running) return;
  const story = gateway.stories.get(sessionId)!;
  story.turnId = "own-work-main-turn";
  story.snapshot.running = true;
  story.snapshot.session.running = true;
  story.snapshot.turnStartedAt = Date.now();
  story.snapshot.inflight = { user: "Eigener laufender Browsertest", assistant: "",
    streaming: true, displayKind: null, displayText: null, corrections: [], error: null, recoverable: false };
}

export async function openWork(page: Page): Promise<void> {
  await openComposer(page);
  await page.getByRole("button", { name: "Aufgaben anzeigen", exact: true }).click();
  await expect(workRegion(page)).toBeVisible();
}

export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter((animation) =>
      Number.isFinite(animation.effect?.getComputedTiming().iterations)).map((animation) => animation.finished.catch(() => {})));
  });
}

export async function clickVisible(page: Page, locator: ReturnType<Page["getByRole"]>): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await settleAnimations(page);
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const hit = await locator.evaluate((element) => {
    const r = element.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return target === element || Boolean(target && element.contains(target));
  });
  expect(hit).toBe(true);
  await locator.click();
}
