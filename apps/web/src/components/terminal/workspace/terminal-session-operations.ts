import type { TerminalSession, TerminalWorkspaceOperation, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { kindLabels } from "../terminal-labels";
import { createEntry, DEFAULT_FOLDER_ID, nextSortOrder, openEntryOps } from "./terminalWorkspaceModel";

/** Verknüpft eine vorhandene Server-Session mit dem Workspace und öffnet dieselbe Runtime. */
export function openSessionOps(
  document: TerminalWorkspaceV2,
  areaId: string,
  sessionOrRuntimeId: TerminalSession | string,
  knownSessions: readonly TerminalSession[] = [],
): TerminalWorkspaceOperation[] {
  const runtimeId = typeof sessionOrRuntimeId === "string" ? sessionOrRuntimeId : sessionOrRuntimeId.runtimeId;
  const session = typeof sessionOrRuntimeId === "string"
    ? knownSessions.find((candidate) => candidate.runtimeId === runtimeId)
    : sessionOrRuntimeId;
  if (!session) return openEntryOps(document, areaId, runtimeId);
  if (document.entries.some((entry) => entry.runtimeId === runtimeId)) return openEntryOps(document, areaId, runtimeId);
  const parentFolderId = document.folders.some((folder) => folder.id === DEFAULT_FOLDER_ID) ? DEFAULT_FOLDER_ID : null;
  const siblings = document.entries.filter((entry) => entry.parentFolderId === parentFolderId);
  const entry = createEntry({
    id: `entry-${runtimeId}`,
    runtimeId,
    name: `${kindLabels[session.kind]} ${document.entries.filter((candidate) => candidate.kind === session.kind).length + 1}`,
    parentFolderId,
    sortOrder: nextSortOrder(siblings),
    kind: session.kind,
    projectId: session.projectId,
    initialCwd: session.cwd,
  });
  return [{ type: "createEntry", entry }, ...openEntryOps(document, areaId, runtimeId)];
}
