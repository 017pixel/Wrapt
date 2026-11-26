import { useEffect, useRef } from "react";
import { terminalTransport } from "./transport/TerminalTransport";
import { useTerminalNotices } from "./terminalNotifications";
import type { TerminalRenderer } from "./engine/rendererTypes";
import type { TerminalStatus } from "./terminal-types";

const CONNECTION_ID = "terminal:connection";
const CONNECTION_DELAY_MS = 1_200;

/** Gleiche Socket-/Serverfehler erscheinen im Split-View nur einmal. */
function errorNoticeId(message: string): string {
  return `terminal:error:${message}`;
}

interface ConnectionEntry {
  active: boolean;
  status: TerminalStatus;
  restarting: boolean;
}

// Ein Socket trägt alle Panes. Verbindungshinweise werden deshalb pro
// Transport zusammengefasst, statt pro Pane zu erscheinen.
const connectionEntries = new Map<string, ConnectionEntry>();
let connectionTimer: number | null = null;
let connectionVisible = false;

function clearConnectionTimer(): void {
  if (connectionTimer !== null) window.clearTimeout(connectionTimer);
  connectionTimer = null;
}

function publishConnectionNotice(): void {
  const entries = [...connectionEntries.values()].filter((entry) => entry.active);
  const disconnected = entries.some((entry) => entry.status === "disconnected");
  const connecting = entries.some((entry) => entry.status === "connecting");
  const restarting = entries.some((entry) => entry.restarting);
  const { show, dismiss } = useTerminalNotices.getState();
  if (restarting || (!disconnected && !connecting)) {
    connectionVisible = false;
    dismiss(CONNECTION_ID);
    return;
  }
  connectionVisible = true;
  show({
    id: CONNECTION_ID,
    tone: "info",
    sticky: true,
    message: disconnected ? "Terminalverbindung unterbrochen. Verbindung wird wiederhergestellt…" : "Terminal wird verbunden…",
    ...(disconnected ? { action: { label: "Verbinden", run: () => terminalTransport.reconnect() } } : {}),
  });
}

function refreshConnectionNotice(): void {
  const entries = [...connectionEntries.values()].filter((entry) => entry.active);
  const needed = !entries.some((entry) => entry.restarting)
    && entries.some((entry) => entry.status === "disconnected" || entry.status === "connecting");
  if (!needed) {
    clearConnectionTimer();
    connectionVisible = false;
    useTerminalNotices.getState().dismiss(CONNECTION_ID);
    return;
  }
  if (connectionVisible) { publishConnectionNotice(); return; }
  if (connectionTimer === null) {
    connectionTimer = window.setTimeout(() => {
      connectionTimer = null;
      publishConnectionNotice();
    }, CONNECTION_DELAY_MS);
  }
}

export function useTerminalNotifications(instanceId: string, active: boolean, renderer: TerminalRenderer): void {
  const actions = useRef(renderer);
  actions.current = renderer;
  const statusRef = useRef(renderer.status);
  statusRef.current = renderer.status;
  const errorRef = useRef(renderer.error);
  errorRef.current = renderer.error;
  const errorNoticeRef = useRef<string | null>(null);
  const { status, error, restartBanner } = renderer;

  useEffect(() => () => {
    connectionEntries.delete(instanceId);
    refreshConnectionNotice();
  }, [instanceId]);

  useEffect(() => {
    connectionEntries.set(instanceId, { active, status, restarting: restartBanner !== null });
    refreshConnectionNotice();
  }, [active, instanceId, restartBanner, status]);

  // Beim Parken oder Unmount darf kein Hinweis eines unsichtbaren Terminals
  // stehen bleiben — sonst sammeln sich Toasts für längst geschlossene Panes.
  useEffect(() => {
    const dismissAll = () => {
      const { dismiss } = useTerminalNotices.getState();
      const errorId = errorNoticeRef.current;
      if (errorId) dismiss(errorId);
      errorNoticeRef.current = null;
      dismiss(`terminal:${instanceId}:restart`);
      dismiss(`terminal:${instanceId}:exited`);
    };
    if (!active) dismissAll();
    return dismissAll;
  }, [active, instanceId]);

  useEffect(() => {
    const id = `terminal:${instanceId}:exited`;
    const { show, dismiss } = useTerminalNotices.getState();
    if (!active || status !== "exited") { dismiss(id); return; }
    show({ id, tone: "info", sticky: true, message: "Das Terminal wurde beendet.", action: { label: "Neu starten", run: () => actions.current.restart() } });
  }, [active, instanceId, status]);

  useEffect(() => {
    const id = error ? errorNoticeId(error) : null;
    const { show, dismiss } = useTerminalNotices.getState();
    const previous = errorNoticeRef.current;
    if (previous && previous !== id) dismiss(previous);
    errorNoticeRef.current = id;
    if (!error || !active || !id) { if (id) dismiss(id); return; }
    // Nur ein echter Terminalfehler bleibt stehen; Kopier-/Einfügehinweise
    // verschwinden weiterhin von selbst. Gleiche Fehler aus mehreren Panes
    // teilen dieselbe ID und erzeugen dadurch nur einen Toast.
    show({ id, tone: "error", message: error, ...(status === "error" ? { sticky: true, action: { label: "Erneut versuchen", run: () => actions.current.resync() } } : {}) });
  }, [active, error, status]);

  // Ein erneut fokussierter Tab zeigt einen weiterhin bestehenden Fehler
  // wieder an, statt ihn nach dem Auto-Dismiss still zu lassen.
  useEffect(() => {
    if (!active) return;
    const onFocus = () => {
      const message = errorRef.current;
      if (!message || statusRef.current !== "error") return;
      const id = errorNoticeId(message);
      errorNoticeRef.current = id;
      useTerminalNotices.getState().show({
        id, tone: "error", sticky: true, message,
        action: { label: "Erneut versuchen", run: () => actions.current.resync() },
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, instanceId]);

  useEffect(() => {
    const id = `terminal:${instanceId}:restart`;
    const { show, dismiss } = useTerminalNotices.getState();
    if (!active || !restartBanner) { dismiss(id); return; }
    show({ id, tone: "info", sticky: true, message: restartBanner.message });
  }, [active, instanceId, restartBanner]);
}
