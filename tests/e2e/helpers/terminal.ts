import type { Page } from "@playwright/test";
import { apiIdentityHeaders } from "./environment";

const emptyTerminalWorkspace = {
  version: 2 as const,
  entries: [],
  folders: [{ id: "default", parentFolderId: null, name: "Terminal", sortOrder: 0, collapsed: false }],
  areaLayouts: {},
};

/** Setzt nur den isolierten Terminal-Testbenutzer zurück, nie die Workbench. */
export async function resetTerminalTestWorkspace(page: Page, login: string): Promise<void> {
  const headers = apiIdentityHeaders(login);
  const origin = process.env.WRAPT_E2E_URL ?? "http://127.0.0.1:3010";
  const workspaceUrl = new URL("/api/v1/terminal/workspace", origin).toString();
  const sessionsUrl = new URL("/api/v1/terminal/sessions", origin).toString();
  const sessionsResponse = await page.request.get(sessionsUrl, { headers });
  if (!sessionsResponse.ok()) throw new Error(`Terminal-Sessions konnten nicht geladen werden (${sessionsResponse.status()}).`);
  const sessions = await sessionsResponse.json() as { sessions: Array<{ id: string }> };
  for (const session of sessions.sessions) {
    const closed = await page.request.delete(`${sessionsUrl}/${session.id}`, { headers });
    if (!closed.ok() && closed.status() !== 404) throw new Error(`Terminal-Session konnte nicht geschlossen werden (${closed.status()}).`);
  }
  const currentResponse = await page.request.get(workspaceUrl, { headers });
  if (!currentResponse.ok()) throw new Error(`Terminal-Workspace konnte nicht geladen werden (${currentResponse.status()}).`);
  const current = await currentResponse.json() as { revision: number };
  const reset = await page.request.put(workspaceUrl, { headers, data: { document: emptyTerminalWorkspace, expectedRevision: current.revision } });
  if (!reset.ok()) throw new Error(`Terminal-Workspace konnte nicht zurückgesetzt werden (${reset.status()}).`);
}
