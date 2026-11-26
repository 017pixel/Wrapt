import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { terminalKeySequence } from "../terminal-utils";
import { sendTerminalSequence } from "../terminal-input";
import type { ClientMessage, TerminalMeta, TerminalStatus } from "../terminal-types";
import type { RendererRefs } from "./rendererTypes";
import type { RendererCore } from "./rendererCore";

interface SessionActionsOptions {
  refs: RendererRefs;
  focusedRef: MutableRefObject<boolean>;
  instanceId: string;
  core: RendererCore;
  sendMessage(message: ClientMessage): boolean;
  setErrorState(message: string | null): void;
  setStatus(status: TerminalStatus): void;
  setPendingPaste: Dispatch<SetStateAction<string | null>>;
  reportMeta(patch: Partial<TerminalMeta>): void;
}

/** Explizite Nutzeraktionen; Wiederverbindung und Render-Lifecycle bleiben im Kern. */
export function useTerminalSessionActions(options: SessionActionsOptions) {
  const { refs, focusedRef, instanceId, core, sendMessage, setErrorState, setStatus, setPendingPaste, reportMeta } = options;
  const { terminalRef, sessionRef, closedRef, hasLiveStateRef, fitRef, ownsGeometryRef, snapshotReplayRef, replayBufferRef } = refs;
  const pasteIntoTerminal = useCallback((text: string) => {
    const terminal = terminalRef.current;
    const sessionId = sessionRef.current;
    if (!terminal || !sessionId) {
      setErrorState("Das Terminal ist noch nicht verbunden. Bitte gleich erneut einfügen.");
      return;
    }
    terminal.paste(text);
    setErrorState(null);
    window.setTimeout(() => terminal.focus(), 0);
  }, [sessionRef, setErrorState, terminalRef]);

  const sendKey = useCallback((key: string, modifiers: { ctrl?: boolean; alt?: boolean } = {}) => {
    sendTerminalSequence(terminalKeySequence(key, modifiers), {
      send: (message) => sendMessage(message as ClientMessage),
      setError: setErrorState,
      sessionRef,
      snapshotReplayRef,
      replayBufferRef,
    });
  }, [replayBufferRef, sendMessage, sessionRef, setErrorState, snapshotReplayRef]);

  const pasteFromClipboard = useCallback(() => {
    navigator.clipboard.readText()
      .then((text) => {
        if (text.length > 10_000) { setPendingPaste(text); return; }
        pasteIntoTerminal(text);
      })
      .catch(() => {
        setErrorState("Einfügen wurde vom Browser nicht erlaubt. Nutze die Browser-Berechtigung für die Zwischenablage.");
        terminalRef.current?.focus();
      });
  }, [pasteIntoTerminal, setErrorState, setPendingPaste, terminalRef]);

  const restart = useCallback(() => {
    // Ein bewusster Neustart öffnet auch eine zuvor explizit beendete Sitzung.
    closedRef.current = false;
    setErrorState(null);
    setStatus("connecting");
    reportMeta({ status: "connecting" });
    const sessionId = sessionRef.current;
    if (!sessionId) { core.createSession(); return; }
    // Erst der bestätigte Server-Snapshot ersetzt den bisherigen Zustand.
    // Bei einem Fehler bleibt der noch sichtbare Verlauf erhalten.
    sendMessage({ type: "terminal.restart", sessionId });
  }, [closedRef, core, reportMeta, sendMessage, sessionRef, setErrorState, setStatus]);

  /** Muss vor einem API-Restart laufen: Der Server broadcastet den Snapshot
   *  bereits während des HTTP-Aufrufs an den offenen Renderer. */
  const prepareRestart = useCallback(() => {
    closedRef.current = false;
    setErrorState(null);
    setStatus("connecting");
    reportMeta({ status: "connecting" });
  }, [closedRef, reportMeta, setErrorState, setStatus]);

  const action = useCallback((type: "terminal.clear" | "terminal.restart" | "terminal.close") => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    sendMessage({ type, sessionId });
    if (type === "terminal.close") {
      closedRef.current = true;
      sessionRef.current = null;
      hasLiveStateRef.current = false;
      setStatus("exited");
    }
  }, [closedRef, hasLiveStateRef, sendMessage, sessionRef, setStatus]);

  /** Wird nach einem erfolgreichen API-Close extern benutzt: Der Renderer
   *  kennt die Sitzung dann lokal als beendet, ohne ein zweites
   *  terminal.close zu senden oder per Reconnect neu zu erzeugen. */
  const markSessionClosed = useCallback(() => {
    closedRef.current = true;
    sessionRef.current = null;
    hasLiveStateRef.current = false;
    setErrorState(null);
    setStatus("exited");
    reportMeta({ status: "exited" });
  }, [closedRef, hasLiveStateRef, reportMeta, sessionRef, setErrorState, setStatus]);

  const resolvePendingPaste = useCallback((confirm: boolean) => {
    setPendingPaste((current) => {
      if (current && confirm) pasteIntoTerminal(current);
      return null;
    });
    terminalRef.current?.focus();
  }, [pasteIntoTerminal, setPendingPaste, terminalRef]);

  const focus = useCallback(() => {
    // PointerDown kommt vor TouchStart. Den Ref sofort setzen, damit ein
    // erster Wisch im frisch angeklickten Pane nicht vom Fokus-Gate verworfen wird.
    focusedRef.current = true;
    terminalRef.current?.focus();
    // Fokus ist echte Nutzerinteraktion: Geometrie-Controlling übernehmen.
    if (sessionRef.current && !ownsGeometryRef.current) {
      const size = fitRef.current?.proposeDimensions();
      sendMessage({ type: "terminal.takeControl", runtimeId: instanceId, ...(size ?? {}) });
    }
  }, [fitRef, focusedRef, instanceId, ownsGeometryRef, sendMessage, sessionRef, terminalRef]);

  return { sendKey, pasteFromClipboard, restart, prepareRestart, action, focus, markSessionClosed, resolvePendingPaste };
}
