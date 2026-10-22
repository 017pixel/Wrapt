import { forwardRef, useImperativeHandle } from "react";
import { ConfirmDialog } from "../ModalDialog";
import type { WebTerminalHandle, WebTerminalProps } from "./terminal-types";
import { useTerminalRenderer } from "./engine/useTerminalRenderer";
import "./terminal-core.css";
import { useTerminalNotifications } from "./useTerminalNotifications";

/**
 * Browser-Terminal für eine stabile Runtime-ID (V2). Nutzt den gemeinsamen
 * multiplexten Transport und die Renderer-Engine: Der Server hält den
 * autoritativen Terminalzustand, dieser Renderer synchronisiert nur, solange
 * er sichtbar ist — beim Detach bleibt die Runtime auf dem Server weiter aktiv.
 */
export const WebTerminal = forwardRef<WebTerminalHandle, WebTerminalProps>(function WebTerminal(
  {
    instanceId,
    sessionId,
    preload = false,
    kind = "shell",
    projectId = null,
    initialCwd = null,
    active = true,
    focused = true,
    renderScale = 1,
    mode = "agent",
    accountId,
    onMetaChange,
  },
  ref,
) {
  const renderer = useTerminalRenderer({
    instanceId, sessionId, preload, kind, projectId, initialCwd, mode, accountId, active, focused,
    renderScale, onMetaChange,
  });

  useImperativeHandle(ref, () => ({
    clear: () => renderer.action("terminal.clear"),
    restart: () => renderer.restart(),
    close: () => renderer.action("terminal.close"),
    resync: () => renderer.resync(),
    focus: () => renderer.focus(),
    sendKey: (key, modifiers = {}) => renderer.sendKey(key, modifiers),
    pasteFromClipboard: () => renderer.pasteFromClipboard(),
  }), [renderer]);

  useTerminalNotifications(instanceId, active, renderer);
  const { pendingPaste, resolvePendingPaste } = renderer;

  return (
    <section className="terminal-session" data-status={renderer.status} onKeyDown={(event) => event.stopPropagation()}>
      <div className="terminal-viewport" ref={renderer.mountRef} onPointerDown={() => renderer.focus()} />
      <ConfirmDialog
        open={pendingPaste !== null}
        title="Großen Text einfügen?"
        description={`Der Inhalt umfasst ${pendingPaste?.length.toLocaleString("de-DE") ?? 0} Zeichen. Prüfe vorher, ob dadurch unbeabsichtigt Befehle ausgeführt werden könnten.`}
        confirmLabel="Trotzdem einfügen"
        onConfirm={() => resolvePendingPaste(true)}
        onClose={() => resolvePendingPaste(false)}
      />
    </section>
  );
});

// Re-Exporte halten die öffentliche API stabil: TerminalArea und Views
// importieren diese Typen weiterhin aus "./WebTerminal".
export type { TerminalStatus, WebTerminalHandle } from "./terminal-types";
