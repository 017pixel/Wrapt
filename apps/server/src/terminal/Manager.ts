import { randomUUID } from "node:crypto";
import type { PtyAdapter } from "./NodePtyAdapter.js";
import { nodePtyAdapter } from "./NodePtyAdapter.js";
import type { TerminalDatabase } from "./database.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import { SupervisorSessionCache } from "./supervisorSessionCache.js";
import type { ServerTerminalMessage, TerminalKind } from "./protocol.js";
import { createProcessRuntime, type ProcessRuntime } from "./process.js";
import { fromStored, importSupervisorSessions, reconcileTerminalSessionsOnStartup, requireValidCwd, validateCwdSync } from "./restore.js";
import { createSessionWithContext, type SessionCreationInput } from "./sessionCreation.js";
import { attachClient, detachClientFromSession, type AttachmentContext } from "./sessionAttachment.js";
import { activateClientGeometry, resizeSessionGeometry, takeControlGeometry } from "./sessionControl.js";
import { SessionMutations } from "./sessionMutations.js";
import { SessionLifecycle, shutdownSessions } from "./sessionLifecycle.js";
import { TerminalFailure, type TerminalClientViewport, type TerminalSession } from "./session.js";
import { restorePersistentSessions } from "./persistentSessions.js";
import { hasLiveSupervisorOwner } from "./runtimeOwnership.js";
import type { TerminalShellConfiguration } from "./shell.js";
import { broadcastSnapshot, sendSync } from "./snapshots.js";

// Behält den öffentlichen Export bei, damit bestehende Importe stabil bleiben.
export { TerminalFailure } from "./session.js";

export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();
  private readonly creationLocks = new Map<string, Promise<TerminalSession>>();
  private readonly cwdRefreshTimers = new Map<string, NodeJS.Timeout>();
  private readonly process: ProcessRuntime;
  private readonly initialization: Promise<void>;
  private readonly mutations = new SessionMutations();
  private readonly lifecycle: SessionLifecycle;
  private readonly supervisorCache = new SupervisorSessionCache(() => Promise.resolve(this.options.supervisor?.list() ?? []));

  constructor(private readonly options: {
    allowedRoots: string[];
    deniedRoots?: string[];
    defaultCwd: string;
    homeDirectory?: string;
    shell?: TerminalShellConfiguration;
    platform?: NodeJS.Platform;
    maxSessions: number;
    cliPaths?: Partial<Record<Exclude<TerminalKind, "shell">, string>>;
    maxSessionsByKind?: Partial<Record<TerminalKind, number>>;
    adapter?: PtyAdapter;
    database?: TerminalDatabase;
    supervisor?: TmuxSupervisor;
    externalSessionOwnerId?: string;
    persistentSessionOwners?: readonly string[];
    reconnectGraceMs?: number;
    onOutput?: (session: Readonly<TerminalSession>, data: string) => void;
    onInput?: (session: Readonly<TerminalSession>, data: string) => void;
    resolveAccountProfile?: (accountId: string, kind: Exclude<TerminalKind, "shell">) => string;
  }) {
    this.process = createProcessRuntime({
      adapter: this.adapter,
      supervisor: this.options.supervisor,
      cliPaths: this.options.cliPaths,
      homeDirectory: this.options.homeDirectory,
      ...(this.options.shell ? { shell: this.options.shell } : {}),
      ...(this.options.platform ? { platform: this.options.platform } : {}),
      onOutput: this.options.onOutput,
      persist: (session) => this.persist(session),
      emit: (session, message) => this.emit(session, message),
      cwdRefreshTimers: this.cwdRefreshTimers,
      validateCwd: (session) => validateCwdSync(session.cwd, this.options.allowedRoots, this.options.deniedRoots ?? []),
      hasLiveSupervisorOwner: (name) => hasLiveSupervisorOwner(this.sessions.values(), name),
      onRuntimeDiscarded: () => this.invalidateSupervisorSnapshot(),
      onRuntimeDiscardFailed: (name) => this.lifecycle.rememberPendingTermination(name),
    });
    this.lifecycle = new SessionLifecycle({
      process: this.process,
      database: this.options.database,
      supervisor: this.options.supervisor,
      sessions: this.sessions,
      emit: (session, message) => this.emit(session, message),
      clearCwdTimer: (sessionId) => this.clearCwdTimer(sessionId),
      invalidateSupervisorSnapshot: () => this.invalidateSupervisorSnapshot(),
      findByRuntime: (ownerId, runtimeId) => this.findByRuntime(ownerId, runtimeId),
      close: (session) => this.close(session),
    });
    this.initialization = (async () => {
      await reconcileTerminalSessionsOnStartup({
        supervisor: this.options.supervisor,
        database: this.options.database,
        externalSessionOwnerId: this.options.externalSessionOwnerId,
        defaultCwd: this.options.defaultCwd,
        allowedRoots: this.options.allowedRoots,
        deniedRoots: this.options.deniedRoots ?? [],
      });
      await restorePersistentSessions({
        database: this.options.database,
        owners: this.options.persistentSessionOwners ?? [],
        allowedRoots: this.options.allowedRoots,
        deniedRoots: this.options.deniedRoots ?? [],
        sessions: this.sessions,
        spawn: (session) => this.process.spawn(session),
        persist: (session) => this.persist(session),
      });
    })();
    void this.initialization.catch(() => {});
  }

  ready(): Promise<void> { return this.initialization; }

  private get adapter() { return this.options.adapter ?? nodePtyAdapter; }

  private get attachmentContext(): AttachmentContext {
    return {
      allowedRoots: this.options.allowedRoots,
      deniedRoots: this.options.deniedRoots ?? [],
      process: this.process,
      supervisor: this.options.supervisor,
      persist: (session) => this.persist(session),
      emit: (session, message) => this.emit(session, message),
      isCurrent: (session, epoch) => this.isCurrent(session, epoch),
    };
  }

  async createSession(userId: string, input: SessionCreationInput): Promise<TerminalSession> {
    await this.ready();
    // Eine früher fehlgeschlagene tmux-Löschung wird vor dem nächsten Start
    // nachgeholt; neue Sessions mit demselben Namen sind dadurch geschützt.
    await this.lifecycle.retryPendingTerminations();
    const lockKey = input.runtimeId ? `${userId}\u0000${input.runtimeId}` : randomUUID();
    const pending = this.creationLocks.get(lockKey);
    if (pending) return pending;
    const creation = createSessionWithContext({
      allowedRoots: this.options.allowedRoots,
      deniedRoots: this.options.deniedRoots ?? [],
      defaultCwd: this.options.defaultCwd,
      maxSessions: this.options.maxSessions,
      maxSessionsByKind: this.options.maxSessionsByKind,
      resolveAccountProfile: this.options.resolveAccountProfile,
      database: this.options.database,
      supervisor: this.options.supervisor,
      process: this.process,
      sessions: this.sessions,
      findByRuntime: (owner, runtime) => this.findByRuntime(owner, runtime),
      persist: (session) => this.persist(session),
      discard: (session) => this.lifecycle.discard(session),
      close: (session) => this.close(session),
      mutate: (sessionId, action) => this.mutations.run(sessionId, action),
      emit: (session, message) => this.emit(session, message),
      isCurrent: (session, epoch) => this.isCurrent(session, epoch),
    }, userId, input);
    this.creationLocks.set(lockKey, creation);
    try {
      const session = await creation;
      this.lifecycle.adopt(session);
      this.invalidateSupervisorSnapshot();
      return session;
    } finally { this.creationLocks.delete(lockKey); }
  }

  async attachSession(userId: string, sessionId: string, client: (message: ServerTerminalMessage) => void, clientId: string = randomUUID(), viewport?: TerminalClientViewport, sync?: { epoch: number; lastSequence: number } | null): Promise<() => void> {
    await this.ready();
    return this.mutations.run(sessionId, async () => {
      const session = this.owned(userId, sessionId);
      const detach = await attachClient(this.attachmentContext, session, { client, clientId, viewport, sync });
      this.lifecycle.adopt(session);
      return detach;
    });
  }

  /** Fordert einen erneuten Sync an (z. B. nach einer erkannten Sequenzlücke). */
  async syncSession(userId: string, sessionId: string, clientId: string, sync: { epoch: number; lastSequence: number }) {
    const session = this.owned(userId, sessionId);
    const client = session.clients.get(clientId);
    if (!client) return;
    await sendSync(session, clientId, client, this.options.supervisor, sync);
  }

  /** Echte Nutzerinteraktion: übernimmt die Geometrie-Eigentümerschaft. */
  takeControl(userId: string, sessionId: string, clientId: string, cols?: number, rows?: number) {
    takeControlGeometry(this.owned(userId, sessionId), clientId, cols, rows, (value) => this.persist(value));
  }

  /** Löst eine Runtime-ID zu ihrer Session auf (legt sie aus der Registry an). */
  resolveRuntime(userId: string, runtimeId: string): TerminalSession {
    const session = this.findByRuntime(userId, runtimeId);
    if (!session) throw new TerminalFailure("SESSION_NOT_FOUND", "Die Terminalsitzung wurde nicht gefunden.");
    return session;
  }

  /** Löst eine Session-ID zu ihrer Session auf (legitimiert gegen den Owner). */
  resolveSession(userId: string, sessionId: string): TerminalSession {
    return this.owned(userId, sessionId);
  }

  /** Entfernt auch einen Client, der nach `create` vor `attach` getrennt wurde. */
  detachClient(userId: string, clientId: string) {
    for (const session of this.sessions.values()) {
      if (session.userId !== userId) continue;
      if (session.clients.has(clientId) || session.primaryClientId === clientId) {
        detachClientFromSession(session, clientId, (value) => this.persist(value));
      }
    }
  }

  /** Markiert den aktuell interagierenden Browser als Geometrie-Eigentümer. */
  activateClient(userId: string, sessionId: string, clientId: string, viewport?: TerminalClientViewport) {
    // Eingaben dürfen auch eine gerade startende oder automatisch
    // wiederhergestellte Sitzung erreichen; die PTY existiert dann noch nicht.
    activateClientGeometry(this.owned(userId, sessionId), clientId, viewport, (value) => this.persist(value));
  }

  writeToSession(userId: string, sessionId: string, data: string) {
    // Auch eine gerade automatisch neu startende Sitzung nimmt Eingaben an:
    // Der Prozess pufferte sie begrenzt und schreibt sie nach dem Attach.
    const session = this.owned(userId, sessionId);
    this.process.write(session, data);
    this.options.onInput?.(session, data);
  }

  resizeSession(userId: string, sessionId: string, cols: number, rows: number, clientId?: string) {
    resizeSessionGeometry(this.owned(userId, sessionId), cols, rows, clientId, (value) => this.persist(value));
  }

  clearSessionHistory(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    if (session.status === "closed") throw new TerminalFailure("SESSION_ALREADY_CLOSED", "Die Terminalsitzung wurde bereits beendet.");
    session.history = ""; session.sequence += 1; session.updatedAt = Date.now();
    // Der Verlauf ist weg: Altes aus Journal und Headless-Zustand entfernen,
    // damit Reconnects denselben leeren Stand sehen wie live geclearte Clients.
    session.journal.clear();
    session.headless?.reset(session.sequence);
    this.persist(session);
    this.emit(session, { type: "terminal.cleared", sessionId, sequence: session.sequence });
  }

  async restartSession(userId: string, sessionId: string) {
    return this.mutations.run(sessionId, async () => {
      const session = this.owned(userId, sessionId);
      if (session.status === "closed") throw new TerminalFailure("SESSION_ALREADY_CLOSED", "Die Terminalsitzung wurde bereits beendet.");
      session.cwd = requireValidCwd(session, this.options.allowedRoots, (value) => this.persist(value), this.options.deniedRoots ?? []);
      if (session.status === "running") await this.process.stopProcess(session, true);
      session.history = ""; session.exitCode = null; session.exitSignal = null; session.status = "starting"; session.updatedAt = Date.now();
      // Ein echter Neustart erzeugt die Runtime neu: neuer Epoch, frischer
      // Terminalzustand, leeres Journal.
      session.epoch += 1;
      session.sequence = 0;
      session.headless?.reset(session.sequence);
      session.journal.clear();
      this.persist(session);
      try {
        await this.process.spawn(session);
      } catch (error) {
        // Ein manueller Neustart darf die Sitzung nicht dauerhaft als
        // "starting" zurücklassen; sonst hängt der Recovery-Monitor daran.
        session.status = "interrupted";
        session.sequence += 1;
        session.updatedAt = Date.now();
        session.lastPersistedAt = undefined;
        this.persist(session);
        throw error;
      }
      this.lifecycle.adopt(session);
      this.invalidateSupervisorSnapshot();
      await broadcastSnapshot(session, this.options.supervisor);
      return session;
    });
  }

  async closeSession(userId: string, sessionId: string) { await this.close(this.owned(userId, sessionId)); }

  /** Wartet auf Workspace-Aufräumen und nachgeholte tmux-Löschungen (Routes). */
  async drainLifecycleCleanups(): Promise<void> {
    await this.lifecycle.drainWorkspaceCleanups();
  }

  private supervisorSessions(force: boolean) { return this.supervisorCache.get(force); }

  private invalidateSupervisorSnapshot(): void { this.supervisorCache.clear(); }

  async listSessions(userId: string, force = false) {
    await this.ready();
    await this.lifecycle.retryPendingTerminations();
    await importSupervisorSessions(userId, {
      supervisor: this.options.supervisor,
      listSessions: () => this.supervisorSessions(force),
      database: this.options.database,
      externalSessionOwnerId: this.options.externalSessionOwnerId,
      defaultCwd: this.options.defaultCwd,
      allowedRoots: this.options.allowedRoots,
      deniedRoots: this.options.deniedRoots ?? [],
      skipSupervisorNames: this.lifecycle.pendingSupervisorNames(),
    });
    const stored = this.options.database?.listSessions(userId, (id) => this.sessions.get(id)?.clients.size ?? 0) ?? [];
    return stored.map((item) => {
      const session = this.sessions.get(item.id);
      return session ? { ...item, ...this.getSessionMetadata(userId, session.id) } : item;
    });
  }

  getSessionMetadata(userId: string, sessionId: string) {
    const session = this.owned(userId, sessionId);
    return { id: session.id, runtimeId: session.runtimeId, userId: session.userId, kind: session.kind, projectId: session.projectId, pid: session.pid, cwd: session.cwd, cols: session.cols, rows: session.rows, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, exitCode: session.exitCode, exitSignal: session.exitSignal, sequence: session.sequence, epoch: session.epoch, connectedClients: session.clients.size };
  }

  async shutdown() {
    const draining = this.process.shutdown();
    await this.ready().catch(() => {});
    await draining;
    await this.lifecycle.drainWorkspaceCleanups();
    await this.mutations.settle();
    for (const timer of this.cwdRefreshTimers.values()) clearTimeout(timer);
    this.cwdRefreshTimers.clear();
    await shutdownSessions({
      process: this.process,
      supervisor: this.options.supervisor,
      sessions: this.sessions,
      persist: (session) => this.persist(session),
    });
    this.lifecycle.dispose();
  }

  private findByRuntime(userId: string, runtimeId: string) {
    const live = [...this.sessions.values()].find((session) => session.userId === userId && session.runtimeId === runtimeId);
    if (live) return live;
    const stored = this.options.database?.findSession(userId, runtimeId);
    if (!stored) return undefined;
    const restored = fromStored(stored);
    this.sessions.set(restored.id, restored);
    return restored;
  }

  private persist(session: TerminalSession) {
    if (session.status === "running" && session.lastPersistedAt !== undefined && session.updatedAt - session.lastPersistedAt < 1_000) return;
    this.options.database?.updateSession({ id: session.id, userId: session.userId, runtimeId: session.runtimeId, kind: session.kind, mode: session.mode, projectId: session.projectId, profilePath: session.profilePath, supervisorName: session.supervisorName, cwd: session.cwd, pid: session.pid, cols: session.cols, rows: session.rows, status: session.status, createdAt: session.createdAt, updatedAt: session.updatedAt, exitCode: session.exitCode, exitSignal: session.exitSignal, epoch: session.epoch });
    session.lastPersistedAt = session.updatedAt;
  }

  private owned(userId: string, sessionId: string) {
    let session = this.sessions.get(sessionId);
    if (!session) {
      const stored = this.options.database?.findSessionById(userId, sessionId);
      if (stored) { session = fromStored(stored); this.sessions.set(session.id, session); }
    }
    if (!session) throw new TerminalFailure("SESSION_NOT_FOUND", "Die Terminalsitzung wurde nicht gefunden.");
    if (session.userId !== userId) throw new TerminalFailure("SESSION_NOT_OWNED", "Kein Zugriff auf diese Terminalsitzung.");
    return session;
  }

  private emit(session: TerminalSession, message: ServerTerminalMessage) {
    for (const client of session.clients.values()) client(message);
  }

  /** Prüft nach awaits, ob die Session noch dieselbe Generation ist. */
  private isCurrent(session: TerminalSession, epoch: number): boolean {
    return session.epoch === epoch && session.status !== "closed" && this.sessions.get(session.id) === session;
  }

  private clearCwdTimer(sessionId: string): void {
    const timer = this.cwdRefreshTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.cwdRefreshTimers.delete(sessionId);
  }

  private close(session: TerminalSession): Promise<void> {
    return this.mutations.run(session.id, () => this.lifecycle.close(session));
  }
}
