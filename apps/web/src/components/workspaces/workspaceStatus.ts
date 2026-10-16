import type { WorkspaceProbeResponse, WorkspaceProbeStatus } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";

export type WorkspaceStatus = WorkspaceProbeStatus | "not-checked" | "checking";

export type WorkspaceProbeResult = WorkspaceProbeResponse;

export function resolveWorkspaceSelfName(instanceName?: string | null, appName?: string | null): string {
  return instanceName?.trim() || appName?.trim() || "Dieses Gerät";
}

export const workspaceStatusLabels: Record<WorkspaceStatus, string> = {
  live: "Live",
  offline: "Offline",
  "not-tailnet": "Nicht im Tailnet (DNS-Fehler)",
  "no-access": "Kein Zugriff",
  incompatible: "Version inkompatibel",
  "not-checked": "Noch nicht geprüft",
  checking: "Prüfe Verbindung …",
};

/**
 * Fragt den eigenen Server nach der Erreichbarkeit eines anderen Workspace.
 * Der Health-Endpunkt des Ziels ist seit S-008 nicht mehr cross-origin lesbar,
 * deshalb läuft der Test serverseitig (siehe /api/v1/workspaces/probe).
 */
export async function probeWorkspace(url: string): Promise<WorkspaceProbeResult> {
  try {
    return (await apiClient.probeWorkspace(url)) ?? offlineProbeResult();
  } catch {
    return offlineProbeResult();
  }
}

function offlineProbeResult(): WorkspaceProbeResult {
  return { status: "offline", reachable: false, version: null, instanceName: null, appName: null, bootId: null };
}
