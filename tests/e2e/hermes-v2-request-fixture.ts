import { expect, test as base, type Page } from "@playwright/test";
import type { HermesV2Request } from "../../packages/contracts/src/hermes-v2";
import { HermesV2BrowserGateway } from "./hermes-v2-gateway";
import { enableHermesV2 } from "./helpers/hermes-v2-settings";

export const sessionId = "request-browser";
export const otherId = "request-other";
export const requestTest = base.extend<{ gateway: HermesV2BrowserGateway }>({
  gateway: async ({ context }, use) => {
    const gateway = new HermesV2BrowserGateway();
    gateway.seed(sessionId, "Anfragen prüfen");
    gateway.seed(otherId, "Andere Sitzung");
    await gateway.install(context);
    await enableHermesV2(context);
    try { await use(gateway); }
    finally { gateway.dispose(); }
  },
});

export const requestCard = (page: Page, request: HermesV2Request) => page.locator(`[data-hermes-request-key="${request.key}"]`);
export const requestCalls = (gateway: HermesV2BrowserGateway, op = "request.respond") => gateway.calls.filter((call) => call.op === op);
export async function openRequestChat(page: Page): Promise<void> {
  await page.goto(`/wrapt/hermes-v2/standalone?session=${sessionId}`);
  await expect(page.getByRole("textbox", { name: "Nachricht an Hermes" })).toBeEnabled();
}
export function openApproval(gateway: HermesV2BrowserGateway) {
  return gateway.requests.open(sessionId, { kind: "approval", method: "approval",
    command: "echo eigener-browser-test", description: "Freigabe für den Browsertest", choices: ["once", "deny"] });
}
export function openSecret(gateway: HermesV2BrowserGateway,
  method: "sudo" | "secret" | "vault.code" | "vault.unlock_prompt" = "secret") {
  return gateway.requests.open(sessionId, { kind: "secret", method, label: "Testpasswort", hint: "Synthetischer Browserwert" });
}
