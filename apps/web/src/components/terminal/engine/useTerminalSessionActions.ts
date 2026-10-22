import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { terminalKeySequence } from "../terminal-utils";
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
  const { terminalRef, sessionRef, closedRef, hasLiveStateRef, fitRef, ownsGeometryRef } = refs;
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
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    sendMessage({ type: "terminal.input", sessionId, data: terminalKeySequence(key, modifiers) });
  }, [sendMessage, sessionRef]);

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
    const sessionId = sessionRef.current;
    if (!sessionId) { setErrorState(null); setStatus("connecting"); core.createSession(); return; }
    sendMessage({ type: "terminal.restart", sessionId });
    // Erst der bestätigte Server-Snapshot ersetzt den bisherigen Zustand.
    // Bei einem Fehler bleibt der noch sichtbare Verlauf erhalten.
    setStatus("connecting");
    reportMeta({ status: "connecting" });
  }, [core, reportMeta, sendMessage, sessionRef, setErrorState, setStatus]);

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

  return { sendKey, pasteFromClipboard, restart, action, focus, resolvePendingPaste };
}
