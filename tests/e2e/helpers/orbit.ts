import type { Page } from "@playwright/test";
import { apiIdentityHeaders } from "./environment";

const e2eBoardId = "orbit-e2e-workspace";

/** Setzt das temporäre Orbit-Dokument des isolierten E2E-Servers zurück. */
export async function resetOrbitTestWorkspace(page: Page, login: string): Promise<void> {
  const origin = process.env.WRAPT_E2E_URL ?? "http://127.0.0.1:3010";
  const headers = apiIdentityHeaders(login);
  const orbitUrl = new URL("/api/v1/orbit", origin).toString();
  const currentResponse = await page.request.get(orbitUrl, { headers });
  if (!currentResponse.ok()) throw new Error(`Orbit-Arbeitsfläche konnte nicht geladen werden (${currentResponse.status()}).`);
  const current = await currentResponse.json() as { revision: number };
  const resetResponse = await page.request.put(orbitUrl, {
    headers,
    data: {
      expectedRevision: current.revision,
      document: {
        version: 8,
        activeBoardId: e2eBoardId,
        focusedNodeId: null,
        boards: [{
          id: e2eBoardId,
          name: "E2E Orbit",
          viewport: { x: 0, y: 0, zoom: 1 },
          worldBounds: { minX: -1_600, minY: -1_000, maxX: 1_600, maxY: 1_000 },
          nodes: [],
          edges: [],
        }],
      },
    },
  });
  if (!resetResponse.ok()) throw new Error(`Orbit-Arbeitsfläche konnte nicht zurückgesetzt werden (${resetResponse.status()}): ${await resetResponse.text()}`);
}
