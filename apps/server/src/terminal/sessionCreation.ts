import { randomUUID } from "node:crypto";
import type { ServerTerminalMessage, TerminalKind } from "./protocol.js";
import type { TerminalDatabase } from "./database.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ProcessRuntime } from "./process.js";
import { EXITED_SESSION_TTL_MS, TerminalFailure, type TerminalSession } from "./session.js";
import { inspectSupervisorPane, livePaneNames, reserveSessionSlot, scanSupervisorPanes, validateCwd } from "./restore.js";
import { recoverSessionRuntime } from "./sessionRecovery.js";
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
  deniedRoots?: string[];
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
  /** Räumt einen fehlgeschlagenen Create auf, ohne die laufende Mutation erneut zu betreten. */
  discard(session: TerminalSession): Promise<void>;
  close(session: TerminalSession): Promise<void>;
  mutate<T>(sessionId: string, action: () => Promise<T>): Promise<T>;
  emit?(session: TerminalSession, message: ServerTerminalMessage): void;
  isCurrent?(session: TerminalSession, epoch: number): boolean;
}

/**
 * Erstellt eine Session oder verbindet eine bestehende Runtime erneut. Der
 * gesamte Lebenszyklus läuft unter derselben Session-Mutation wie Restart und
 * Close. Die Quota wird mit Datenbank atomar reserviert.
 */
export async function createSessionWithContext(
  context: SessionCreationContext,
  userId: string,
  input: SessionCreationInput,
): Promise<TerminalSession> {
  const runtimeId = input.runtimeId ?? randomUUID();
  const existing = context.findByRuntime(userId, runtimeId);
  if (existing) return context.mutate(existing.id, () => reattachSession(context, existing, input));

  const sessionId = randomUUID();
  return context.mutate(sessionId, async () => {
    const kind = input.kind ?? "shell";
    // Beendete Sessions, deren TTL abgelaufen ist, räumen sich selbst auf.
    const now = Date.now();
    for (const session of [...context.sessions.values()]) {
      if (session.status === "exited" && now - session.updatedAt > EXITED_SESSION_TTL_MS) {
        await context.close(session);
      }
    }
    const activeSessions = [...context.sessions.values()].filter((session) => session.userId === userId && session.status !== "closed");
    const kindLimit = context.maxSessionsByKind?.[kind] ?? context.maxSessions;
    // Ohne Datenbank ist die In-Memory-Map die einzige Quelle. Mit Datenbank
    // entscheidet die atomare Reservierung unten.
    if (!context.database) {
      if (activeSessions.filter((session) => session.kind === kind).length >= kindLimit) {
        throw new TerminalFailure("TOO_MANY_SESSIONS", `Die maximale Anzahl gleichzeitig geöffneter ${context.process.kindLabel(kind)}-Instanzen ist erreicht.`);
      }
      if (activeSessions.length >= context.maxSessions) throw new TerminalFailure("TOO_MANY_SESSIONS", "Die maximale Anzahl gleichzeitig geöffneter Terminals ist erreicht.");
    }
    const cwd = await validateCwd(input.cwd ?? context.defaultCwd, context.allowedRoots, context.deniedRoots ?? []);
    if (input.mode === "login" && (kind === "shell" || !input.accountId)) throw new TerminalFailure("INVALID_MESSAGE", "Für die Anmeldung fehlt ein gültiger Account.");
    let profilePath: string | null = null;
    if (input.accountId && kind !== "shell") {
      try { profilePath = context.resolveAccountProfile?.(input.accountId, kind) ?? null; }
      catch { throw new TerminalFailure("INVALID_MESSAGE", "Der Anmeldeaccount wurde nicht gefunden."); }
    }
    const session: TerminalSession = {
      id: sessionId, userId, runtimeId, kind, mode: input.mode ?? "agent", profilePath,
      projectId: input.projectId ?? null, supervisorName: null, pty: null, pid: 0, cwd, cols: input.cols, rows: input.rows,
      status: "starting", history: "", createdAt: now, updatedAt: now, exitCode: null, exitSignal: null, sequence: 0,
      epoch: 0, clients: new Map(), clientViewports: new Map(), primaryClientId: input.clientId ?? null,
      dataListener: null, exitListener: null, lastPersistedAt: undefined,
      headless: null, journal: new OutputJournal(),
      geometry: new GeometryLease(input.cols, input.rows, input.clientId ?? null),
    };
    if (context.database) {
      // Nur lebende Panen zählen als Supervisor-Prozess. Ein nicht verfügbarer
      // Scan darf keine existierende Pane fälschlich aus der Quote nehmen.
      let activeNames = new Set<string>();
      try {
        const scan = await scanSupervisorPanes(context.supervisor);
        if (scan?.available) activeNames = livePaneNames(scan.sessions);
      } catch { /* Die Datenbank entscheidet anhand des persistierten Status. */ }
      reserveSessionSlot(context.database, session, { overall: context.maxSessions, kind: kindLimit }, context.process.kindLabel(kind), activeNames);
      session.lastPersistedAt = session.updatedAt;
    }
    context.sessions.set(session.id, session);
    if (!context.database) context.persist(session);
    try {
      const runtime = context.process as ProcessRuntime & { spawn(session: TerminalSession, resetOnCreate?: boolean): Promise<void> };
      await runtime.spawn(session, true);
      return session;
    } catch (error) {
      const pane = await inspectSupervisorPane(context.supervisor, session.supervisorName);
      if (pane.state === "alive" || pane.state === "dead") {
        // Die tmux-Pane existiert. Sie bleibt abrufbar, auch wenn das PTY-Gateway
        // gerade nicht angebunden werden konnte.
        if (pane.state === "dead") {
          const cleanExit = pane.exitCode === 0 && (pane.exitSignal === null || pane.exitSignal === undefined || pane.exitSignal === 0);
          session.status = cleanExit ? "exited" : "interrupted";
          session.exitCode = pane.exitCode;
          session.exitSignal = pane.exitSignal ?? null;
          session.sequence += 1;
        } else {
          session.status = "interrupted";
        }
        session.updatedAt = Date.now();
        session.lastPersistedAt = undefined;
        context.persist(session);
        return session;
      }
      if (pane.state === "unknown") {
        // Kein verlässlicher Scan: nichts löschen, was noch leben könnte.
        session.status = "interrupted";
        session.updatedAt = Date.now();
        session.lastPersistedAt = undefined;
        context.persist(session);
        throw error;
      }
      await context.discard(session);
      throw error;
    }
  });
}

export async function reattachSession(
  context: Pick<SessionCreationContext, "allowedRoots" | "deniedRoots" | "persist" | "process" | "supervisor" | "emit" | "isCurrent">,
  existing: TerminalSession,
  input: SessionCreationInput,
  options: { allowExited?: boolean } = {},
): Promise<TerminalSession> {
  if (existing.kind !== (input.kind ?? "shell") || existing.projectId !== (input.projectId ?? null)) {
    throw new TerminalFailure("SESSION_RUNTIME_CONFLICT", "Diese Werkzeuginstanz ist bereits an eine andere Session gebunden.");
  }
  // Wenn kein Gerät mehr verbunden ist, gehört die PTY-Geometrie dem
  // wiederkehrenden Client. Vor dem Snapshot wird die Runtime bereits resized.
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
  await recoverSessionRuntime({
    allowedRoots: context.allowedRoots,
    deniedRoots: context.deniedRoots ?? [],
    process: context.process,
    supervisor: context.supervisor,
    persist: context.persist,
    ...(context.emit ? { emit: context.emit } : {}),
    ...(context.isCurrent ? { isCurrent: context.isCurrent } : {}),
  }, existing, options);
  context.persist(existing);
  return existing;
}
