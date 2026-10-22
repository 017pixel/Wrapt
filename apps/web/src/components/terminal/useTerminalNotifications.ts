import { useEffect, useRef } from "react";
import { useTerminalNotices } from "./terminalNotifications";
import type { TerminalRenderer } from "./engine/rendererTypes";

export function useTerminalNotifications(instanceId: string, active: boolean, renderer: TerminalRenderer): void {
  const actions = useRef(renderer);
  actions.current = renderer;
  const { status, error, restartBanner } = renderer;
  useEffect(() => {
    const id = `terminal:${instanceId}:connection`;
    const { show, dismiss } = useTerminalNotices.getState();
    if (!active) return;
    if (status === "connected") { dismiss(id); return; }
    if (status !== "connecting" && status !== "disconnected" && status !== "exited") return;
    const timer = window.setTimeout(() => show({
      id, tone: "info",
      message: status === "exited" ? "Das Terminal wurde beendet." : status === "disconnected" ? "Terminalverbindung unterbrochen. Verbindung wird wiederhergestellt…" : "Terminal wird verbunden…",
      action: { label: status === "exited" ? "Neu starten" : "Verbinden", run: () => status === "exited" ? actions.current.restart() : actions.current.resync() },
    }), status === "exited" ? 0 : 1_200);
    return () => window.clearTimeout(timer);
  }, [active, instanceId, status]);

  useEffect(() => {
    const id = `terminal:${instanceId}:error`;
    const { show, dismiss } = useTerminalNotices.getState();
    if (!error) { dismiss(id); return; }
    if (active) show({ id, tone: "error", message: error, ...(status === "error" ? { action: { label: "Erneut versuchen", run: () => actions.current.resync() } } : {}) });
  }, [active, error, instanceId, status]);

  useEffect(() => {
    if (active && restartBanner) useTerminalNotices.getState().show({ id: `terminal:${instanceId}:restart`, tone: "info", message: restartBanner.message });
  }, [active, instanceId, restartBanner]);
}
