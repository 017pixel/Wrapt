import type { ProcessRuntime } from "./process.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import { inspectSupervisorPane, requireValidCwd, type PaneStatus } from "./restore.js";
import type { ServerTerminalMessage } from "./protocol.js";
import type { TerminalSession } from "./session.js";

export interface SessionRecoveryContext {
  allowedRoots: string[];
  deniedRoots: string[];
  process: ProcessRuntime;
  supervisor: TmuxSupervisor | undefined;
  persist(session: TerminalSession): void;
  emit?(session: TerminalSession, message: ServerTerminalMessage): void;
  isCurrent?(session: TerminalSession, epoch: number): boolean;
}

export interface SessionRecoveryOptions {
  /** Beim Attach bleibt eine beendete Session beendet; Create darf sie neu starten. */
  allowExited?: boolean;
}

function isCleanExit(pane: PaneStatus): boolean {
  return pane.exitCode === 0 && (pane.exitSignal === null || pane.exitSignal === undefined || pane.exitSignal === 0);
}

function markPaneExited(context: SessionRecoveryContext, session: TerminalSession, pane: PaneStatus): void {
  session.status = isCleanExit(pane) ? "exited" : "interrupted";
  session.exitCode = pane.exitCode;
  session.exitSignal = pane.exitSignal ?? null;
  session.sequence += 1;
  session.updatedAt = Date.now();
  session.lastPersistedAt = undefined;
  context.persist(session);
  context.emit?.(session, {
    type: "terminal.exited",
    sessionId: session.id,
    exitCode: session.exitCode,
    signal: session.exitSignal,
    sequence: session.sequence,
  });
}

/**
 * Gemeinsamer Wiederanbindungsweg für Create und Attach. Der Pane-Zustand
 * entscheidet: Eine tote Pane behält ihren ehrlichen Exit-Zustand, eine
 * fehlende wird neu gestartet, eine lebende nur angebunden. Ein Scanfehler
 * ("unknown") startet nichts unwiderruflich neu.
 */
export async function recoverSessionRuntime(
  context: SessionRecoveryContext,
  session: TerminalSession,
  options: SessionRecoveryOptions = {},
): Promise<void> {
  if (session.pty || session.status === "closed") return;
  if (options.allowExited === false && session.status === "exited") return;

  // Generation nach den awaits: Wurde die Session inzwischen geschlossen oder
  // ersetzt, darf ihr kein veralteter Spawn mehr angehängt werden.
  const epoch = session.epoch;
  const current = () => session.status !== "closed" && session.epoch === epoch
    && (context.isCurrent?.(session, epoch) ?? true);
  if (!current()) return;

  const pane = await inspectSupervisorPane(context.supervisor, session.supervisorName);
  if (!current()) return;
  // Beim Attach ist eine tote Pane endgültig. Beim Create darf derselbe
  // Zustand neu gestartet werden (bewusste Nutzeraktion).
  if (pane.state === "dead" && options.allowExited === false) {
    markPaneExited(context, session, pane);
    return;
  }

  session.cwd = requireValidCwd(session, context.allowedRoots, context.persist, context.deniedRoots);
  if (!current()) return;

  // Eine fehlende oder tote Pane erzeugt eine neue Runtime. Ein unklarer
  // Zustand (Scanfehler) wird nur angebunden, damit eine lebende Pane nicht
  // durch einen Respawn verloren geht.
  const createsRuntime = pane.state === "missing" || pane.state === "dead";
  // Eine neue Runtime entsteht auch dann, wenn eine lebende Pane ohne
  // Headless-Zustand angebunden wird (etwa nach einem Backend-Neustart).
  // Ohne neues Epoch hielte ein zurückkehrender Client seinen alten
  // Sequenzstand für gültig und bekäme leere Deltas statt eines Snapshots.
  // attachPty erkennt den vorbereiteten Zustand über `alreadyReset` und
  // erhöht den Epoch deshalb nicht ein zweites Mal.
  if (createsRuntime || !session.headless) session.epoch += 1;
  if (createsRuntime) {
    session.sequence = 0;
    session.exitCode = null;
    session.exitSignal = null;
    session.headless?.reset(session.sequence);
    session.journal.clear();
  } else if (session.status === "exited") {
    // Eine noch lebende Pane wird angebunden; der alte Exit-Code gilt nicht mehr.
    session.exitCode = null;
    session.exitSignal = null;
  }
  session.status = "starting";
  session.updatedAt = Date.now();
  session.lastPersistedAt = undefined;
  context.persist(session);

  try {
    // Das optionale Argument wird von der ProcessRuntime ausgewertet.
    const runtime = context.process as ProcessRuntime & { spawn(session: TerminalSession, resetOnCreate?: boolean): Promise<void> };
    await runtime.spawn(session, createsRuntime);
  } catch (error) {
    // Hat eine parallele Auto-Recovery die lebende PTY bereits übernommen,
    // ist der abgebrochene Attach kein Fehlerzustand der Sitzung.
    if (session.pty && (session.status as string) === "running") return;
    // Nach dem Spawn kann die Runtime selbst den Epoch erhöht haben. Für die
    // Fehlerbehandlung zählt deshalb nur, ob die Session noch dieselbe und
    // nicht geschlossen ist.
    if ((session.status as string) === "closed" || !(context.isCurrent?.(session, session.epoch) ?? true)) return;
    session.status = "interrupted";
    session.sequence += 1;
    session.updatedAt = Date.now();
    session.lastPersistedAt = undefined;
    context.persist(session);
    throw error;
  }
  // Ein erfolgreicher Spawn kann epoch/sequence selbst neu gesetzt haben.
  session.lastPersistedAt = undefined;
  context.persist(session);
}
