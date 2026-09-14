import { randomUUID } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { TerminalDatabase, StoredTerminalSession } from "./database.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import { GeometryLease } from "./runtime/GeometryLease.js";
import { OutputJournal } from "./runtime/OutputJournal.js";
import { TerminalFailure, type TerminalSession } from "./session.js";

function contained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

function canonicalRootSync(root: string): string {
  try { return realpathSync(root); } catch { return resolve(root); }
}

/**
 * Kanonisiert einen Pfad und verlangt, dass das realpath-Ziel in einer der
 * erlaubten Wurzeln liegt. Ein Symlink innerhalb einer Wurzel, der nach außen
 * zeigt, wird damit beim Import und vor jedem Prozessstart abgelehnt.
 */
export function canonicalCwdWithinRootsSync(value: string, allowedRoots: string[]): string | null {
  let candidate: string;
  try { candidate = resolve(value); } catch { return null; }
  if (!allowedRoots.some((root) => contained(root, candidate))) return null;
  let canonical: string;
  try { canonical = realpathSync(candidate); } catch { return null; }
  try { if (!statSync(canonical).isDirectory()) return null; } catch { return null; }
  if (!allowedRoots.some((root) => contained(canonicalRootSync(root), canonical))) return null;
  return canonical;
}

/** Baut eine laufende Session aus einem gespeicherten Datensatz wieder auf. */
export function fromStored(stored: StoredTerminalSession): TerminalSession {
  return {
    ...stored,
    pty: null,
    history: "",
    clients: new Map(),
    clientViewports: new Map(),
    primaryClientId: null,
    dataListener: null,
    exitListener: null,
    sequence: 0,
    lastPersistedAt: undefined,
    headless: null,
    journal: new OutputJournal(),
    geometry: new GeometryLease(stored.cols, stored.rows),
  };
}

/** Stellt beim Start den Konsistenzzustand zwischen Registry und Supervisor her
 *  und übernimmt vorhandene Supervisor-Sessions in die persistierte Quote. */
export function reconcileTerminalSessionsOnStartup(deps: {
  supervisor: TmuxSupervisor | undefined;
  database: TerminalDatabase | undefined;
  externalSessionOwnerId: string | undefined;
  defaultCwd: string;
  allowedRoots: string[];
}): void {
  if (deps.supervisor) {
    deps.database?.reconcileSupervisorSessions(new Set(deps.supervisor.list().map((session) => session.name)));
  } else {
    deps.database?.markRunningSessionsInterrupted();
  }
  if (deps.externalSessionOwnerId) {
    importSupervisorSessions(deps.externalSessionOwnerId, {
      supervisor: deps.supervisor,
      database: deps.database,
      externalSessionOwnerId: deps.externalSessionOwnerId,
      defaultCwd: deps.defaultCwd,
      allowedRoots: deps.allowedRoots,
    });
  }
}

/** Kanonisiert den CWD vor einem Start; ein unzulässiger Pfad legt die Session
 *  sichtbar still, statt einen Prozess außerhalb der Wurzel zu starten. */
export function requireValidCwd(
  session: TerminalSession,
  allowedRoots: string[],
  persist: (session: TerminalSession) => void,
): string {
  try {
    return validateCwdSync(session.cwd, allowedRoots);
  } catch (error) {
    session.status = "interrupted";
    session.updatedAt = Date.now();
    persist(session);
    throw error;
  }
}

/** Reserviert einen Quota-Platz in der Persistenz und übersetzt das Ergebnis
 *  in die Terminal-Fehlersemantik. */
export function reserveSessionSlot(
  database: TerminalDatabase,
  session: TerminalSession,
  limits: { overall: number; kind: number },
  kindLabel: string,
): void {
  const reservation = database.tryReserveSession(session, limits);
  if (reservation === "reserved") return;
  throw new TerminalFailure(
    "TOO_MANY_SESSIONS",
    reservation === "kind-limit"
      ? `Die maximale Anzahl gleichzeitig geöffneter ${kindLabel}-Instanzen ist erreicht.`
      : "Die maximale Anzahl gleichzeitig geöffneter Terminals ist erreicht.",
  );
}

/** Prüft die Terminalgröße gegen die unterstützten Grenzen. */
export function assertValidViewport(cols: number, rows: number): void {
  if (cols < 2 || cols > 500 || rows < 1 || rows > 300) throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße ist ungültig.");
}

/** Erkennt vorhandene tmux-Sessions eines Einzelbenutzers und legt sie als
 *  verwaltete Sessions in der Registry ab. */
export function importSupervisorSessions(userId: string, deps: {
  supervisor: TmuxSupervisor | undefined;
  database: TerminalDatabase | undefined;
  externalSessionOwnerId: string | undefined;
  defaultCwd: string;
  allowedRoots: string[];
}): void {
  const { supervisor, database, externalSessionOwnerId, defaultCwd, allowedRoots } = deps;
  if (!supervisor || !database) return;
  if (externalSessionOwnerId !== userId) return;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const fallbackCwd = canonicalCwdWithinRootsSync(defaultCwd, allowedRoots) ?? defaultCwd;
  for (const discovered of supervisor.list()) {
    // Die eigene Supervisor-Session ist technisch ebenfalls ein tmux-Pane,
    // aber keine Nutzer-Session. Ohne diesen Filter würde jeder Backend-Start
    // `wrapt-supervisor` als Terminal in die Registry importieren.
    if (!discovered.managed || database.findSessionBySupervisor(discovered.name)) continue;
    const now = Date.now();
    // Das tmux-Pane kann inzwischen außerhalb der erlaubten Wurzeln stehen.
    // Der gespeicherte CWD fällt dann auf die Standardwurzel zurück, statt
    // einen späteren Respawn außerhalb der Grenze zu ermöglichen.
    const cwd = isAbsolute(discovered.cwd)
      ? canonicalCwdWithinRootsSync(discovered.cwd, allowedRoots) ?? fallbackCwd
      : fallbackCwd;
    database.saveSession({
      id: randomUUID(),
      userId,
      runtimeId: discovered.runtimeId && uuidPattern.test(discovered.runtimeId) ? discovered.runtimeId : randomUUID(),
      kind: discovered.kind,
      mode: "agent",
      projectId: discovered.projectId,
      profilePath: null,
      supervisorName: discovered.name,
      cwd,
      pid: 0,
      cols: 120,
      rows: 32,
      status: "running",
      createdAt: discovered.createdAt || now,
      updatedAt: now,
      exitCode: null,
      exitSignal: null,
      epoch: 0,
    });
  }
}

/** Prüft ein Arbeitsverzeichnis kanonisch gegen die erlaubten Wurzeln und gibt
 *  den aufgelösten, symlink-freien Pfad zurück. Synchron, damit ein
 *  Supervisor-Respawn ohne Zustandslücke vor dem Spawn validieren kann. */
export function validateCwdSync(value: string, allowedRoots: string[]): string {
  let cwd: string;
  try { cwd = resolve(value); }
  catch { throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis ist ungültig."); }
  if (!allowedRoots.some((root) => contained(root, cwd))) {
    throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis liegt außerhalb der erlaubten Bereiche.");
  }
  let details;
  try { details = statSync(cwd); }
  catch { throw new TerminalFailure("CWD_NOT_FOUND", "Das Arbeitsverzeichnis wurde nicht gefunden."); }
  if (!details.isDirectory()) throw new TerminalFailure("CWD_NOT_DIRECTORY", "Der angegebene Pfad ist kein Verzeichnis.");
  let canonical: string;
  try { canonical = realpathSync(cwd); }
  catch { throw new TerminalFailure("CWD_NOT_FOUND", "Das Arbeitsverzeichnis wurde nicht gefunden."); }
  // Nicht nur der lexikalische Pfad, sondern auch sein realpath-Ziel muss in
  // einer erlaubten Wurzel liegen. Ein Symlink innerhalb des Root, der aus ihm
  // herausführt, kann die Workspace-Grenze sonst umgehen.
  if (!allowedRoots.some((root) => contained(canonicalRootSync(root), canonical))) {
    throw new TerminalFailure("INVALID_CWD", "Das Arbeitsverzeichnis liegt außerhalb der erlaubten Bereiche.");
  }
  return canonical;
}

/** Asynchrone Fassade für Aufrufer, die bereits in einem Promise-Kontext leben. */
export async function validateCwd(value: string, allowedRoots: string[]): Promise<string> {
  return validateCwdSync(value, allowedRoots);
}
