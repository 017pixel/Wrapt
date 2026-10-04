import type { MutableRefObject } from "react";
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
          options.reportError(runtimeId, error instanceof Error ? error.message : "Das Terminal konnte nicht neu gestartet werden.");
        }
      })();
    },
  };
}
