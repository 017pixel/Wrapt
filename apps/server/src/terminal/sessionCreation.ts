import { randomUUID } from "node:crypto";
import type { TerminalKind } from "./protocol.js";
import type { TerminalDatabase } from "./database.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ProcessRuntime } from "./process.js";
import { EXITED_SESSION_TTL_MS, TerminalFailure, type TerminalSession } from "./session.js";
import { requireValidCwd, reserveSessionSlot, validateCwd } from "./restore.js";
import { GeometryLease } from "./runtime/GeometryLease.js";
import { OutputJournal } from "./runtime/OutputJournal.js";
import { applyResize } from "./snapshots.js";

export interface SessionCreationInput {
  runtimeId?: string;
  projectId?: string | null;
  kind?: TerminalKind;
  cwd?: string;
  cols: number;
  rows: number;
  mode?: "agent" | "login";
  accountId?: string;
  clientId?: string;
}

export interface SessionCreationContext {
  allowedRoots: string[];
  defaultCwd: string;
  maxSessions: number;
  maxSessionsByKind: Partial<Record<TerminalKind, number>> | undefined;
  resolveAccountProfile: ((accountId: string, kind: Exclude<TerminalKind, "shell">) => string) | undefined;
  database: TerminalDatabase | undefined;
  supervisor: TmuxSupervisor | undefined;
  process: ProcessRuntime;
  sessions: Map<string, TerminalSession>;
  findByRuntime(userId: string, runtimeId: string): TerminalSession | undefined;
  persist(session: TerminalSession): void;
  close(session: TerminalSession): void;
}

/**
 * Erstellt eine Session oder verbindet eine bestehende Runtime erneut. Die
 * Quota wird mit Datenbank atomar reserviert; vor jedem Spawn wird der CWD
 * erneut kanonisch geprüft und eine unzulässige Session stillgelegt.
 */
export async function createSessionWithContext(
  context: SessionCreationContext,
  userId: string,
  input: SessionCreationInput,
): Promise<TerminalSession> {
  const runtimeId = input.runtimeId ?? randomUUID();
  const existing = context.findByRuntime(userId, runtimeId);
  if (existing) return reattachSession(context, existing, input);

  const kind = input.kind ?? "shell";
  // Beendete Sessions, deren TTL abgelaufen ist, räumen sich selbst auf.
  const now = Date.now();
  for (const session of [...context.sessions.values()]) {
    if (session.status === "exited" && now - session.updatedAt > EXITED_SESSION_TTL_MS) {
      context.close(session);
    }
  }
  const activeSessions = [...context.sessions.values()].filter((session) => session.userId === userId && session.status !== "closed");
  const kindLimit = context.maxSessionsByKind?.[kind] ?? context.maxSessions;
  // Ohne Datenbank ist die In-Memory-Map die einzige Quelle. Mit Datenbank
  // entscheidet die atomare Reservierung unten, damit die Quote auch nach
  // Neustarts und bei parallelen Anfragen gilt.
  if (!context.database) {
    if (activeSessions.filter((session) => session.kind === kind).length >= kindLimit) {
      throw new TerminalFailure("TOO_MANY_SESSIONS", `Die maximale Anzahl gleichzeitig geöffneter ${context.process.kindLabel(kind)}-Instanzen ist erreicht.`);
    }
    if (activeSessions.length >= context.maxSessions) throw new TerminalFailure("TOO_MANY_SESSIONS", "Die maximale Anzahl gleichzeitig geöffneter Terminals ist erreicht.");
  }
  const cwd = await validateCwd(input.cwd ?? context.defaultCwd, context.allowedRoots);
  if (input.mode === "login" && (kind === "shell" || !input.accountId)) throw new TerminalFailure("INVALID_MESSAGE", "Für die Anmeldung fehlt ein gültiger Account.");
  let profilePath: string | null = null;
  if (input.accountId && kind !== "shell") {
    try { profilePath = context.resolveAccountProfile?.(input.accountId, kind) ?? null; }
    catch { throw new TerminalFailure("INVALID_MESSAGE", "Der Anmeldeaccount wurde nicht gefunden."); }
  }
  const session: TerminalSession = {
    id: randomUUID(), userId, runtimeId, kind, mode: input.mode ?? "agent", profilePath,
    projectId: input.projectId ?? null, supervisorName: null, pty: null, pid: 0, cwd, cols: input.cols, rows: input.rows,
    status: "starting", history: "", createdAt: now, updatedAt: now, exitCode: null, exitSignal: null, sequence: 0,
    epoch: 0, clients: new Map(), clientViewports: new Map(), primaryClientId: input.clientId ?? null,
    dataListener: null, exitListener: null, lastPersistedAt: undefined,
    headless: null, journal: new OutputJournal(),
    geometry: new GeometryLease(input.cols, input.rows, input.clientId ?? null),
  };
  if (context.database) {
    reserveSessionSlot(context.database, session, { overall: context.maxSessions, kind: kindLimit }, context.process.kindLabel(kind));
    // Die Reservierung hat den Datensatz bereits geschrieben.
    session.lastPersistedAt = session.updatedAt;
  }
  context.sessions.set(session.id, session);
  if (!context.database) context.persist(session);
  try {
    context.process.spawn(session);
    return session;
  } catch (error) {
    // Schlägt nur das Anhängen fehl (etwa direkt nach dem Aufwachen aus dem
    // Schlaf), während die tmux-Session weiterlebt, bleibt die Session bestehen.
    if (context.supervisor && session.supervisorName && context.supervisor.has(session.supervisorName)) {
      session.status = "interrupted";
      session.updatedAt = Date.now();
      context.persist(session);
      return session;
    }
    context.sessions.delete(session.id);
    context.database?.deleteSession(userId, session.id);
    throw error;
  }
}

function reattachSession(context: SessionCreationContext, existing: TerminalSession, input: SessionCreationInput): TerminalSession {
  if (existing.kind !== (input.kind ?? "shell") || existing.projectId !== (input.projectId ?? null)) {
    throw new TerminalFailure("SESSION_RUNTIME_CONFLICT", "Diese Werkzeuginstanz ist bereits an eine andere Session gebunden.");
  }
  // Wenn kein Gerät mehr verbunden ist, gehört die PTY-Geometrie dem
  // wiederkehrenden Client. Wichtig: Nicht nur die Metadaten aktualisieren,
  // sondern eine noch lebende PTY wirklich resizen, damit Fullscreen-TUIs
  // vor dem Snapshot bereits im neuen Raster zeichnen.
  const ownsInitialGeometry = existing.clients.size === 0
    && (existing.primaryClientId === null || existing.primaryClientId === input.clientId);
  if (ownsInitialGeometry) {
    if (existing.primaryClientId === null && input.clientId) existing.primaryClientId = input.clientId;
    if (existing.status === "running" && existing.pty) {
      try { applyResize(existing, input.cols, input.rows, (session) => context.persist(session)); }
      catch { throw new TerminalFailure("PTY_RESIZE_FAILED", "Die Terminalgröße konnte nicht angepasst werden."); }
    } else {
      existing.cols = input.cols;
      existing.rows = input.rows;
    }
  }
  if (!existing.pty) {
    const supervisorAlive = context.supervisor && existing.supervisorName && context.supervisor.has(existing.supervisorName);
    // Jede pty-lose, nicht geschlossene Session wird beim nächsten
    // Verbinden wieder in den laufenden Zustand gebracht.
    if (existing.status !== "running" || supervisorAlive) {
      // Persistierte Pfade sind nur bis zum nächsten Start gültig. Vor jedem
      // Spawn wird der CWD erneut kanonisch geprüft; eine Session mit
      // unzulässigem Pfad wird sichtbar stillgelegt statt gestartet.
      existing.cwd = requireValidCwd(existing, context.allowedRoots, (session) => context.persist(session));
      existing.status = "starting";
      context.process.spawn(existing);
    } else if (existing.status === "running") {
      existing.status = "interrupted";
    }
  }
  context.persist(existing);
  return existing;
}
