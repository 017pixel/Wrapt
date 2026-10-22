import { expect, request, type BrowserContext, type Page } from "@playwright/test";
import { e2eOrigin } from "./environment";

const identity = { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" };

/**
 * Hermes V2 liegt in einer serverweit synchronisierten Einstellung. Ein reiner
 * localStorage-Seed wird beim Start vom Serverstand überschrieben, deshalb
 * muss die Testinstanz den Zustand vor dem ersten Seitenaufruf speichern.
 */
export async function setHermesV2(context: BrowserContext, enabled: boolean): Promise<void> {
  const api = await request.newContext({ baseURL: e2eOrigin, extraHTTPHeaders: identity });
  try {
    const response = await api.put("/api/v1/settings/ui", {
      data: {
        clientId: "hermes-v2-e2e",
        changes: [{
          key: "appPreferences",
          value: {
            version: 2,
            state: { defaultPage: "dashboard", hermesV2Enabled: enabled },
          },
        }],
      },
    });
    if (!response.ok()) {
      throw new Error(`Hermes-V2-Einstellung konnte nicht gespeichert werden: ${response.status()} ${await response.text()}`);
    }
  } finally {
    await api.dispose();
  }
  await context.addInitScript((value) => {
    // Nur den leeren Kontext initialisieren. Eine spätere Nutzeränderung im
    // selben Tab darf beim Navigieren nicht erneut überschrieben werden.
    if (localStorage.getItem("wrapt.app-preferences.v1") === null) {
      localStorage.setItem("wrapt.app-preferences.v1", JSON.stringify({
        version: 2,
        state: { defaultPage: "dashboard", hermesV2Enabled: value },
      }));
    }
  }, enabled);
}

export function enableHermesV2(context: BrowserContext): Promise<void> {
  return setHermesV2(context, true);
}

/** Wartet, bis die debouncte Einstellung den Server erreicht hat. */
export async function waitForHermesV2(page: Page, enabled: boolean): Promise<void> {
  await expect.poll(async () => {
    const response = await page.request.get("/api/v1/settings/ui", { headers: identity });
    if (!response.ok()) return null;
    const document = await response.json() as {
      entries?: Record<string, { value?: { state?: { hermesV2Enabled?: unknown } } }>;
    };
    return document.entries?.appPreferences?.value?.state?.hermesV2Enabled ?? null;
  }).toBe(enabled);
}
