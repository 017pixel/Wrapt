import { useEffect, useRef } from "react";
import type { TerminalKind, TerminalSession, TerminalWorkspaceOperation, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { openSessionOps } from "./workspace/terminal-session-operations";
import { createTerminalOps } from "./workspace/terminalWorkspaceModel";
import { kindLabels } from "./terminal-labels";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";

/** Session-Deeplinks öffnen bestehende Sitzungen; Orbit-Runtimes dürfen neu entstehen. */
export function useTerminalPaneRequest(options: {
  areaId: string;
  active: boolean;
  requestedSessionId: string | null;
  requestedRuntimeId: string | null;
  kind: TerminalKind;
  initialProjectId: string | null;
  document: TerminalWorkspaceV2 | null;
  sessions: readonly TerminalSession[] | undefined;
}) {
  const handledRef = useRef<string | null>(null);
  const { areaId, active, requestedSessionId, requestedRuntimeId, kind, initialProjectId, document, sessions } = options;

  useEffect(() => {
    const requestKey = requestedRuntimeId ? `runtime:${requestedRuntimeId}` : requestedSessionId ? `session:${requestedSessionId}` : null;
    if (!requestKey) { handledRef.current = null; return; }
    if (!active || handledRef.current === requestKey || !document || !sessions) return;
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return;
    const session = sessions.find((candidate) => requestedRuntimeId
      ? candidate.runtimeId === requestedRuntimeId
      : candidate.id === requestedSessionId || candidate.runtimeId === requestedSessionId);
    let ops: TerminalWorkspaceOperation[];
    if (session) ops = openSessionOps(state.document, areaId, session);
    else if (requestedRuntimeId) {
      if (state.document.entries.some((entry) => entry.runtimeId === requestedRuntimeId)) {
        ops = openSessionOps(state.document, areaId, requestedRuntimeId);
      } else {
        const count = state.document.entries.filter((entry) => entry.kind === kind).length + 1;
        ops = createTerminalOps(state.document, areaId, {
          runtimeId: requestedRuntimeId,
          kind,
          projectId: initialProjectId,
          name: `${kindLabels[kind]} ${count}`,
        }).ops;
      }
    } else return;
    handledRef.current = requestKey;
    state.queueOps(ops);
  }, [active, areaId, document, initialProjectId, kind, requestedRuntimeId, requestedSessionId, sessions]);
}
