import { useEffect, useRef } from "react";
import type { TerminalSession, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { openSessionOps } from "./workspace/terminal-session-operations";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";

/** Deep-Link einer bestehenden Session in die angegebene Terminalfläche übernehmen. */
export function useTerminalSessionRequest(options: {
  areaId: string;
  active: boolean;
  requestedSessionId: string | null;
  document: TerminalWorkspaceV2 | null;
  sessions: readonly TerminalSession[] | undefined;
}) {
  const handledRef = useRef<string | null>(null);
  const { areaId, active, requestedSessionId, document, sessions } = options;

  useEffect(() => {
    if (!requestedSessionId) { handledRef.current = null; return; }
    if (!active || handledRef.current === requestedSessionId || !document || !sessions) return;
    const session = sessions.find((candidate) => candidate.id === requestedSessionId || candidate.runtimeId === requestedSessionId);
    if (!session) return;
    const state = useTerminalWorkspaceStore.getState();
    if (!state.document) return;
    handledRef.current = requestedSessionId;
    state.queueOps(openSessionOps(state.document, areaId, session));
  }, [active, areaId, document, requestedSessionId, sessions]);
}
