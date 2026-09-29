import type { TerminalKind, TerminalSession } from "@wrapt/contracts";
import { CloseIcon, ExternalLinkIcon, ListIcon, PlayIcon, PlusIcon } from "../icons";
import { kindLabels } from "./terminal-labels";

interface TerminalSessionPickerProps {
  kind: TerminalKind;
  sessions: TerminalSession[];
  openTabIds: string[];
  orbitEnabled: boolean;
  onOpen(session: TerminalSession): void;
  onOpenInOrbit(session: TerminalSession): void;
  onRestart(session: TerminalSession): void;
  onClose(session: TerminalSession): void;
}

/** Aufklappbare Liste der laufenden Sessions eines Werkzeugs: öffnen, neu
 *  starten und beenden. Zeigt den Verbindungszustand als Statuskugel. */
export function TerminalSessionPicker({ kind, sessions, openTabIds, orbitEnabled, onOpen, onOpenInOrbit, onRestart, onClose }: TerminalSessionPickerProps) {
  const filtered = sessions.filter((session) => session.kind === kind);
  return (
    <details className="terminal-session-picker">
      <summary aria-label="Laufende Sessions anzeigen" title="Laufende Sessions"><ListIcon className="h-4 w-4" /><span>Sessions</span></summary>
      <div className="terminal-session-picker-menu">
        <strong>Laufende {kindLabels[kind]}-Sessions</strong>
        {filtered.map((session) => (
          <div key={session.id} className="terminal-session-picker-row">
            <div className="min-w-0">
              <span className="terminal-session-picker-title"><span className={`terminal-state is-${session.status === "running" ? "connected" : session.status}`} />{session.projectId ?? "Standardpfad"}</span>
              <small>{session.status === "running" ? `${session.connectedClients} Gerät${session.connectedClients === 1 ? "" : "e"}` : session.status} · {new Date(session.updatedAt).toLocaleTimeString()}</small>
            </div>
            <div className="terminal-session-picker-actions">
              {session.status !== "running" ? <button type="button" onClick={() => void onRestart(session)} aria-label="Session neu starten" title="Neu starten"><PlayIcon className="h-3.5 w-3.5" /></button> : null}
              {!openTabIds.includes(session.runtimeId) ? <button type="button" onClick={() => onOpen(session)} aria-label="Session öffnen" title="Öffnen"><PlusIcon className="h-3.5 w-3.5" /></button> : null}
              {orbitEnabled && kind !== "opencode" ? <button type="button" style={{ width: 44, height: 44, minWidth: 44, minHeight: 44 }} onClick={() => onOpenInOrbit(session)} aria-label="Session im Orbit öffnen" title="Im Orbit öffnen"><ExternalLinkIcon className="h-3.5 w-3.5" /></button> : null}
              <button type="button" onClick={() => void onClose(session)} aria-label="Session beenden" title="Beenden"><CloseIcon className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 ? <span className="terminal-session-picker-empty">Keine gespeicherten Sessions</span> : null}
      </div>
    </details>
  );
}
