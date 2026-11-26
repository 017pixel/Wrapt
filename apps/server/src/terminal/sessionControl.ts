import { assertValidViewport } from "./restore.js";
import { announceGeometry, applyResize } from "./snapshots.js";
import { TerminalFailure, type TerminalClientViewport, type TerminalSession } from "./session.js";

type Persist = (session: TerminalSession) => void;

function applyPrimaryGeometry(
  session: TerminalSession,
  cols: number,
  rows: number,
  changedOwner: boolean,
  persist: Persist,
): void {
  try {
    const unchangedSize = session.cols === cols && session.rows === rows;
    applyResize(session, cols, rows, persist);
    if (changedOwner && unchangedSize) announceGeometry(session);
  } catch {
    throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden.");
  }
}

function hasLiveRuntime(session: TerminalSession): boolean {
  return session.status === "running" && session.pty !== null;
}

/** Markiert den interagierenden Client als Primary; ohne PTY nur Buchführung. */
export function activateClientGeometry(
  session: TerminalSession,
  clientId: string,
  viewport: TerminalClientViewport | undefined,
  persist: Persist,
): void {
  if (!session.clients.has(clientId)) return;
  const changedOwner = session.primaryClientId !== clientId;
  if (viewport) {
    assertValidViewport(viewport.cols, viewport.rows);
    session.clientViewports.set(clientId, viewport);
  }
  session.primaryClientId = clientId;
  const target = viewport ?? (changedOwner ? session.clientViewports.get(clientId) : undefined);
  if (!target || !hasLiveRuntime(session)) return;
  applyPrimaryGeometry(session, target.cols, target.rows, changedOwner, persist);
}

/** Übernimmt die Geometrie bei echter Interaktion; ohne PTY nur Buchführung. */
export function takeControlGeometry(
  session: TerminalSession,
  clientId: string,
  cols: number | undefined,
  rows: number | undefined,
  persist: Persist,
): void {
  if (!session.clients.has(clientId)) return;
  const viewport = cols !== undefined && rows !== undefined ? { cols, rows } : undefined;
  if (viewport) {
    assertValidViewport(viewport.cols, viewport.rows);
    session.clientViewports.set(clientId, viewport);
  }
  const changedOwner = session.primaryClientId !== clientId;
  session.primaryClientId = clientId;
  if (!hasLiveRuntime(session)) return;
  const target = viewport ?? session.clientViewports.get(clientId);
  if (!target) return;
  applyPrimaryGeometry(session, target.cols, target.rows, changedOwner, persist);
}

/** Merkt eine gewünschte Größe vor, wenn gerade keine Runtime läuft. */
export function resizeSessionGeometry(
  session: TerminalSession,
  cols: number,
  rows: number,
  clientId: string | undefined,
  persist: Persist,
): void {
  assertValidViewport(cols, rows);
  if (clientId) {
    if (!session.clients.has(clientId)) return;
    session.clientViewports.set(clientId, { cols, rows });
    if (session.primaryClientId !== clientId) return;
  }
  if (!hasLiveRuntime(session)) {
    session.cols = cols;
    session.rows = rows;
    session.headless?.resize(cols, rows);
    session.updatedAt = Date.now();
    session.lastPersistedAt = undefined;
    persist(session);
    return;
  }
  try { applyResize(session, cols, rows, persist); }
  catch { throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden."); }
}
