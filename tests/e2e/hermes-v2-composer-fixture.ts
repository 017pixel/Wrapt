import { expect, type Page } from "@playwright/test";
import { requestTest, sessionId, otherId, openRequestChat } from "./hermes-v2-request-fixture";
import type { HermesV2BrowserGateway } from "./hermes-v2-gateway";

export { requestTest as composerTest, sessionId, otherId };
export function prepareComposer(gateway: HermesV2BrowserGateway): void {
  gateway.composer.seed(sessionId);
  gateway.composer.seed(otherId);
}
export async function openComposer(page: Page): Promise<void> {
  await openRequestChat(page);
  await expect(page.getByRole("button", { name: "Modell wählen", exact: true })).toBeEnabled();
}
export async function modelPicker(page: Page) {
  await page.getByRole("button", { name: "Modell wählen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Modell und Anbieter", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("searchbox", { name: "Modelle suchen", exact: true })).toBeEnabled();
  return dialog;
}
export const composerInput = (page: Page) => page.getByRole("textbox", { name: "Nachricht an Hermes", exact: true });
export const mutationCalls = (gateway: HermesV2BrowserGateway, op: string) => gateway.calls.filter((call) => call.op === op);
export const fileInput = (page: Page) => page.getByLabel("Dateien für Hermes auswählen", { exact: true });
export const uploadCard = (page: Page, name: string) => page.locator("[data-upload-id]").filter({ hasText: name });
