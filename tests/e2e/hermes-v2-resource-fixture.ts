import { expect, type Page } from "@playwright/test";
import { composerTest, prepareComposer, openComposer, composerInput, sessionId } from "./hermes-v2-composer-fixture";
import type { HermesV2BrowserGateway } from "./hermes-v2-gateway";

export { composerTest as resourceTest, prepareComposer as prepareResources, sessionId, composerInput };
export type ResourceLabel = "Chat" | "Cron" | "Skills" | "Memory" | "Konfiguration" | "Diagnose";
export const areaTab = (page: Page, name: ResourceLabel) => page.getByRole("tab", { name: `Bereich: ${name}`, exact: true });
export const resourceRegion = (page: Page, name: string) => page.locator(`[data-hermes-area="${name}"]`).last();
export const resourceWrites = (gateway: HermesV2BrowserGateway) => gateway.resources.calls.filter((call) => call.method !== "GET");

export async function selectArea(page: Page, name: ResourceLabel): Promise<void> {
  if (await areaTab(page, name).isVisible()) {
    await areaTab(page, name).click();
    await expect(areaTab(page, name)).toHaveAttribute("aria-selected", "true");
  } else {
    await page.getByRole("tab", { name: "Weitere Hermes-Bereiche" }).click();
    await page.getByRole("dialog", { name: "Weitere Bereiche" }).getByRole("button", { name, exact: true }).click();
    await expect(page.locator("[data-hermes-ui='v2']")).toHaveAttribute("data-hermes-area", name === "Diagnose" ? "diagnostics" : "configuration");
  }
}

export async function openResources(page: Page, name: ResourceLabel = "Cron"): Promise<void> {
  await openComposer(page);
  await selectArea(page, name);
}

export async function selectCron(page: Page, name = "Eigener Prüfjob"): Promise<void> {
  await page.getByRole("button", { name: `Cron-Job: ${name}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Cron-Job ausführen: ${name}`, exact: true })).toBeVisible();
}
