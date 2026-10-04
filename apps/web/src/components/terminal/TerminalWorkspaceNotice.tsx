import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";

/** Verbindungsfehler beim Layout dürfen nicht als leere Fläche verschwinden. */
export function TerminalWorkspaceNotice() {
  const hydrated = useTerminalWorkspaceStore((state) => state.hydrated);
  const error = useTerminalWorkspaceStore((state) => state.syncError);
  if (hydrated && !error) return null;
  return <div className="terminal-connection-banner" role={error ? "alert" : "status"}>
    {error ?? "Terminals werden geladen…"}
  </div>;
}
