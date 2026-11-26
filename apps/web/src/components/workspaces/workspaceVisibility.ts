import { isLoopbackWorkspace, type WorkspaceEntry } from "./workspaceModel";

export interface WorkspaceVisibilityContext {
  selfUrl: string | null;
  selfBootId?: string | null;
  bootIds?: Readonly<Record<string, string | null>>;
}

/**
 * Workspaces, die in dieser Ansicht tatsächlich wählbar sind.
 *
 * - Loopback gehört dem Gerät des Betrachters. In einer Remote-Ansicht zeigt
 *   es auf den Betrachter statt auf den Server und ist deshalb kein Workspace.
 * - Zwei Origins desselben Backends (gleiche bootId) sind nur ein Workspace.
 */
export function visibleWorkspaceEntries(
  entries: readonly WorkspaceEntry[],
  { selfUrl, selfBootId = null, bootIds = {} }: WorkspaceVisibilityContext,
): WorkspaceEntry[] {
  const remoteSelf = Boolean(selfUrl && !isLoopbackWorkspace(selfUrl));
  return entries.filter((entry) => {
    if (entry.url === selfUrl) return true;
    const bootId = bootIds[entry.url] ?? null;
    if (selfBootId && bootId && bootId === selfBootId) return false;
    if (remoteSelf && isLoopbackWorkspace(entry.url)) return false;
    return true;
  });
}
