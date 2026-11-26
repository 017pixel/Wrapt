import type { ProcessRuntime } from "./process.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { assertValidViewport } from "./restore.js";
import { reattachSession } from "./sessionCreation.js";
import { announceGeometry, applyResize, sendSync } from "./snapshots.js";
import { TerminalFailure, type TerminalClientViewport, type TerminalSession } from "./session.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";

export interface AttachmentContext {
  allowedRoots: string[];
  deniedRoots: string[];
  process: ProcessRuntime;
  supervisor: TmuxSupervisor | undefined;
  persist(session: TerminalSession): void;
  emit(session: TerminalSession, message: ServerTerminalMessage): void;
  isCurrent(session: TerminalSession, epoch: number): boolean;
}

export interface AttachmentInput {
  client: (message: ServerTerminalMessage) => void;
  clientId: string;
  viewport?: TerminalClientViewport | undefined;
  sync?: { epoch: number; lastSequence: number } | null | undefined;
}

/**
 * Verbindet einen Client. Eine pty-lose, nicht ausdrücklich beendete Session
 * läuft durch denselben pane-bewussten Wiederanbindungsweg wie Create; ein
 * vorheriges `has()` ist dafür weder nötig noch ausreichend.
 */
export async function attachClient(
  context: AttachmentContext,
  session: TerminalSession,
  input: AttachmentInput,
): Promise<() => void> {
  const { client, clientId, viewport } = input;
  if (viewport) assertValidViewport(viewport.cols, viewport.rows);
  if (!session.pty && session.status !== "closed" && session.status !== "exited") {
    await reattachSession({
      allowedRoots: context.allowedRoots,
      deniedRoots: context.deniedRoots,
      process: context.process,
      supervisor: context.supervisor,
      persist: context.persist,
      emit: context.emit,
      isCurrent: context.isCurrent,
    }, session, {
      kind: session.kind,
      projectId: session.projectId,
      clientId,
      cols: viewport?.cols ?? session.cols,
      rows: viewport?.rows ?? session.rows,
    }, { allowExited: false });
  }
  session.clients.set(clientId, client);
  if (viewport) {
    assertValidViewport(viewport.cols, viewport.rows);
    session.clientViewports.set(clientId, viewport);
  } else {
    session.clientViewports.set(clientId, { cols: session.cols, rows: session.rows });
  }
  // Ein Primary, dessen Client nicht mehr registriert ist, darf den neuen
  // Verbindungsaufbau nicht dauerhaft von der Geometrie ausschließen.
  if (session.primaryClientId === null || !session.clients.has(session.primaryClientId)) {
    session.primaryClientId = clientId;
  }
  try {
    // Die Geometrie muss vor dem Snapshot stimmen: Wird dieser Client Primary,
    // bekommt die PTY sofort seinen Viewport. Sonst entsteht der Snapshot im
    // Raster des Vorgängers und wird danach in einem anders großen xterm
    // eingespielt — genau das zerreißt Fullscreen-TUIs.
    if (session.primaryClientId === clientId && viewport && session.status === "running" && session.pty) {
      try { applyResize(session, viewport.cols, viewport.rows, (value) => context.persist(value)); }
      catch { throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden."); }
    }
    // Ein Client mit konsistentem Zustand bekommt Deltas statt eines vollen
    // Snapshots (Fast Reconnect); sonst den vollen serialisierten Zustand.
    await sendSync(session, clientId, client, context.supervisor, input.sync);
  } catch (error) {
    // Ein fehlgeschlagener Snapshot darf keinen Geister-Client und keinen
    // falschen Geometrie-Eigentümer in der Session zurücklassen.
    detachClientFromSession(session, clientId, (value) => context.persist(value));
    throw error;
  }
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    detachClientFromSession(session, clientId, (value) => context.persist(value));
  };
}

export function detachClientFromSession(
  session: TerminalSession,
  clientId: string,
  persist: (session: TerminalSession) => void,
): void {
  const wasPrimary = session.primaryClientId === clientId;
  session.clients.delete(clientId);
  session.clientViewports.delete(clientId);
  if (!wasPrimary) return;
  const next = session.clients.keys().next().value as string | undefined;
  session.primaryClientId = next ?? null;
  const viewport = next ? session.clientViewports.get(next) : undefined;
  if (!viewport || session.status !== "running" || !session.pty) return;
  try {
    const unchangedSize = session.cols === viewport.cols && session.rows === viewport.rows;
    applyResize(session, viewport.cols, viewport.rows, persist);
    if (unchangedSize) announceGeometry(session);
  } catch { /* Der neue Primary passt beim nächsten Resize erneut an. */ }
}
