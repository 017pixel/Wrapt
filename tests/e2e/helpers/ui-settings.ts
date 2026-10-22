import { request } from "@playwright/test";
import { e2eOrigin } from "./environment";

const identity = { "tailscale-user-login": process.env.WRAPT_E2E_USER ?? "user@example.com" };

/**
 * Setzt die serverseitig synchronisierte Sidebar-Präferenz auf die Vorgaben
 * zurück. Mehrere Chromium-Specs teilen sich eine Testinstanz; ohne Reset
 * leakt eine ausgeblendete Seite in den nächsten Test.
 */
export async function resetSidebarPreferences(): Promise<void> {
  const api = await request.newContext({ baseURL: e2eOrigin, extraHTTPHeaders: identity });
  try {
    const response = await api.put("/api/v1/settings/ui", {
      data: {
        clientId: "e2e-sidebar-reset",
        changes: [{ key: "sidebarPreferences", value: { version: 5, state: {} } }],
      },
    });
    if (!response.ok()) {
      throw new Error(`Sidebar-Einstellung konnte nicht zurückgesetzt werden: ${response.status()} ${await response.text()}`);
    }
  } finally {
    await api.dispose();
  }
}
