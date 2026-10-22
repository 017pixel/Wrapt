import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";
import { useEffect } from "react";
import { useTerminalNotices } from "./terminalNotifications";

/** Verbindungsfehler beim Layout dürfen nicht als leere Fläche verschwinden. */
export function TerminalWorkspaceNotice() {
  const hydrated = useTerminalWorkspaceStore((state) => state.hydrated);
  const error = useTerminalWorkspaceStore((state) => state.syncError);
  useEffect(() => {
    const { show, dismiss } = useTerminalNotices.getState();
    if (error) show({ id: "terminal:workspace", tone: "error", message: error });
    else dismiss("terminal:workspace");
  }, [error]);
  return hydrated ? null : <div className="terminal-loading-skeleton" aria-label="Terminals werden geladen" role="status"><span /><span /><span /></div>;
}
