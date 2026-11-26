import type { MutableRefObject } from "react";
import type { TerminalSession } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import type { WebTerminalHandle } from "./WebTerminal";

/** Aktionen funktionieren auch für geparkte und noch nicht gerenderte Sitzungen. */
export function useTerminalRuntimeActions(options: {
  handles: MutableRefObject<Map<string, WebTerminalHandle>>;
  openEntry(runtimeId: string): void;
  refresh(): void;
  reportError(runtimeId: string, message: string): void;
}) {
  return {
    resync(runtimeId: string) {
      options.openEntry(runtimeId);
      window.requestAnimationFrame(() => options.handles.current.get(runtimeId)?.resync());
    },
    restart(runtimeId: string) {
      void (async () => {
        const handle = options.handles.current.get(runtimeId);
        // Der HTTP-Restart sendet den neuen Snapshot bereits während des
        // Requests. Der Renderer muss vorher aus dem geschlossenen Zustand.
        handle?.prepareRestart();
        try {
          const response = await apiClient.terminalSessions();
          const session = response?.sessions.find((candidate) => candidate.runtimeId === runtimeId);
          if (session) await apiClient.restartTerminalSession(session.id);
          else {
            options.openEntry(runtimeId);
            window.requestAnimationFrame(() => options.handles.current.get(runtimeId)?.restart());
          }
          options.refresh();
        } catch (error) {
          handle?.resync();
          options.reportError(runtimeId, error instanceof Error ? error.message : "Das Terminal konnte nicht neu gestartet werden.");
        }
      })();
    },
    /** Beendet eine Sitzung über die API. Erst der bestätigte Close markiert
     *  den Renderer lokal als beendet — ein getrennter Socket würde sonst beim
     *  nächsten Reconnect dieselbe Sitzung neu erzeugen. */
    close(session: TerminalSession) {
      void (async () => {
        try {
          await apiClient.closeTerminalSession(session.id);
          options.handles.current.get(session.runtimeId)?.markSessionClosed();
          options.refresh();
        } catch (error) {
          options.reportError(session.runtimeId, error instanceof Error ? error.message : "Das Terminal konnte nicht beendet werden.");
        }
      })();
    },
  };
}
