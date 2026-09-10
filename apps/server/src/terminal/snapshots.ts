import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { HISTORY_LIMIT, SNAPSHOT_LIMIT, type TerminalSession } from "./session.js";

export function limitHistory(history: string): string {
  return history.length <= HISTORY_LIMIT ? history : history.slice(history.length - HISTORY_LIMIT).replace(/^[^\n]*\n/, "");
}

/** Kürzt die History für den Snapshot auf den schlanken Anzeigeumfang. */
export function snapshotHistory(history: string): string {
  return history.length <= SNAPSHOT_LIMIT ? history : history.slice(history.length - SNAPSHOT_LIMIT).replace(/^[^\n]*\n/, "");
}

/** True, wenn die Pane gerade den Alternate Screen (Fullscreen-TUI) nutzt. */
export function isAlternateScreen(session: TerminalSession, supervisor: TmuxSupervisor | undefined): boolean {
  if (session.headless) return session.headless.alternate;
  if (!supervisor || !session.supervisorName || !supervisor.has(session.supervisorName)) return false;
  try { return supervisor.isAlternate?.(session.supervisorName) ?? false; }
  catch { return false; }
}

/**
 * tmux kennt den tatsächlich gerenderten Pane-Inhalt. Für Reconnects ist
 * dieser Zustand wesentlich robuster als ein beliebiger Ausschnitt aus dem
 * rohen ANSI-Bytestrom, besonders bei OpenCode, Codex und Claude Code.
 */
export function snapshotForClient(session: TerminalSession, supervisor: TmuxSupervisor | undefined): string {
  if (supervisor && session.supervisorName && supervisor.has(session.supervisorName)) {
    try { return snapshotHistory(supervisor.capture(session.supervisorName)); }
    catch { /* Fallback auf den lokalen ANSI-Verlauf. */ }
  }
  return snapshotHistory(session.history);
}

/** Erzeugt einen geometrie-treuen Snapshot für genau einen Client. Der
 *  serialisierte Zustand stammt aus dem autoritativen Headless-Terminal und
 *  wird nur dann aus tmux/History zurückgebaut, wenn kein Headless-Zustand
 *  vorliegt (etwa direkt nach einem Backend-Neustart). */
export function snapshotMessage(session: TerminalSession, clientId: string, supervisor: TmuxSupervisor | undefined): ServerTerminalMessage {
  const serialized = session.headless?.snapshot() ?? null;
  // Die Snapshot-Sequenz ist der zuletzt lückenlos geparste Stand des
  // Headless-Terminals in Session-Sequenz-Basis, damit Inhalt und Sequenz
  // immer zusammenpassen (xterm puffert asynchron). Der Client fordert alles
  // danach per Deltas oder Resync an — dieselbe Basis wie die Live-Outputs.
  const sequence = session.headless ? session.headless.parsedSequence : session.sequence;
  return {
    type: "terminal.snapshot",
    sessionId: session.id,
    runtimeId: session.runtimeId,
    kind: session.kind,
    status: session.status,
    projectId: session.projectId,
    cwd: session.cwd,
    epoch: session.epoch,
    sequence,
    cols: serialized?.cols ?? session.cols,
    rows: serialized?.rows ?? session.rows,
    ownsGeometry: session.primaryClientId === clientId,
    alternate: serialized?.alternate ?? isAlternateScreen(session, supervisor),
    mouseTracking: serialized?.mouseTracking ?? false,
    serialized: serialized?.serialized ?? snapshotForClient(session, supervisor),
  };
}

export function broadcastSnapshot(session: TerminalSession, supervisor: TmuxSupervisor | undefined): void {
  for (const [clientId, client] of session.clients) client(snapshotMessage(session, clientId, supervisor));
}

/**
 * Beantwortet eine Sync-Anfrage eines Clients. Weiß der Client, dass er einen
 * konsistenten Zustand an Sequenz `lastSequence` im selben Epoch besitzt, und
 * sind alle Deltas danach noch im Journal, werden nur die Deltas nachgeliefert
 * (Fast Reconnect). Sonst gibt es einen vollen Snapshot an Sequenz N.
 */
export function sendSync(
  session: TerminalSession,
  clientId: string,
  client: (message: ServerTerminalMessage) => void,
  supervisor: TmuxSupervisor | undefined,
  sync: { epoch: number; lastSequence: number } | null | undefined,
): void {
  if (sync && sync.epoch === session.epoch) {
    const deltas = session.journal.deltasAfter(sync.lastSequence);
    // Leere Deltas bestätigen einen aktuellen Stand nur, wenn der Client
    // wirklich auf der Session-Sequenz steht. Dahinter und bei leerem Journal
    // (Clear, Restart, wiederhergestellte Session) braucht es einen Snapshot,
    // sonst hängt der Client unsichtbar hinterher.
    if (deltas !== null && (deltas.length > 0 || sync.lastSequence === session.sequence)) {
      // Auch eine leere Delta-Liste wird gesendet: Sie bestätigt dem Client,
      // dass sein Stand aktuell ist und der Sync abgeschlossen ist.
      client({
        type: "terminal.deltas",
        sessionId: session.id,
        runtimeId: session.runtimeId,
        epoch: session.epoch,
        startSequence: sync.lastSequence + 1,
        deltas,
      });
      return;
    }
  }
  client(snapshotMessage(session, clientId, supervisor));
}

/** Verteilt die gemeinsame Geometrie an alle Clients. Der Primary bekommt
 *  `ownsGeometry`, damit er sich auf sein eigenes Fenster anpasst; die
 *  übrigen Clients übernehmen das gemeinsame Raster unverändert. */
export function announceGeometry(session: TerminalSession): void {
  for (const [clientId, client] of session.clients) {
    client({ type: "terminal.geometry", sessionId: session.id, cols: session.cols, rows: session.rows, ownsGeometry: session.primaryClientId === clientId });
  }
}

/** Resized die PTY und den Headless-Terminal nur bei echter Geometrieänderung
 *  und meldet sie zurück. */
export function applyResize(session: TerminalSession, cols: number, rows: number, persist: (session: TerminalSession) => void): void {
  // Kein Ping-Pong: Nur eine echte Geometrieänderung resize die PTY und
  // meldet sie zurück. Sonst würde jede identische Resize-Meldung erneut
  // verteilt und vom Client wieder beantwortet werden (Endlosschleife).
  if (session.cols === cols && session.rows === rows) return;
  session.pty?.resize(cols, rows);
  session.headless?.resize(cols, rows);
  session.cols = cols;
  session.rows = rows;
  session.updatedAt = Date.now();
  persist(session);
  announceGeometry(session);
}
