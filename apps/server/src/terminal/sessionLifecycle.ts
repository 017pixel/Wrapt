import type { TerminalDatabase, TerminalWorkspaceChange } from "./database.js";
import type { ProcessRuntime } from "./process.js";
import type { ServerTerminalMessage } from "./protocol.js";
import type { TerminalSession } from "./session.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";

interface SessionLifecycleDependencies {
  process: Pick<ProcessRuntime, "stopProcess">;
  database: TerminalDatabase | undefined;
  supervisor: TmuxSupervisor | undefined;
  sessions: Map<string, TerminalSession>;
  emit(session: TerminalSession, message: ServerTerminalMessage): void;
  clearCwdTimer(sessionId: string): void;
  invalidateSupervisorSnapshot(): void;
  findByRuntime(userId: string, runtimeId: string): TerminalSession | undefined;
  /** Close über die Session-Mutation des Managers (serialisiert mit Restart). */
  close(session: TerminalSession): Promise<void>;
}

/** Räumt eine Session auch dann vollständig, wenn das Stoppen der Runtime fehlschlägt. */
function finalizeSession(deps: SessionLifecycleDependencies, session: TerminalSession): void {
  deps.clearCwdTimer(session.id);
  session.dataListener?.dispose();
  session.exitListener?.dispose();
  session.dataListener = null;
  session.exitListener = null;
  session.pty = null;
  session.headless?.dispose();
  session.headless = null;
  session.clients.clear();
  session.clientViewports.clear();
  session.primaryClientId = null;
  try {
    deps.database?.deleteSession(session.userId, session.id);
  } finally {
    if (deps.sessions.get(session.id) === session) deps.sessions.delete(session.id);
    deps.invalidateSupervisorSnapshot();
  }
}

/** Bündelt Close, Workspace-Aufräumen und Wiederholung fehlgeschlagener tmux-Löschungen. */
export class SessionLifecycle {
  private readonly workspaceCleanups = new Set<Promise<void>>();
  private readonly pendingTerminations = new Set<string>();
  /** Ein Close pro Session: Parallele Aufrufe teilen sich dieselbe Generation. */
  private readonly closings = new Map<string, Promise<void>>();
  private readonly finalized = new WeakSet<TerminalSession>();
  private readonly unsubscribe: () => void;
  private stopped = false;

  constructor(private readonly deps: SessionLifecycleDependencies) {
    this.unsubscribe = deps.database?.onWorkspaceChange((change) => this.queueWorkspaceCleanup(change)) ?? (() => {});
  }

  /** Löst die Workspace-Meldungen; ein beendeter Manager darf keine fremden
   *  Sitzungen mehr schließen, wenn ein neuer Manager dieselbe Registry nutzt. */
  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribe();
    this.pendingTerminations.clear();
  }

  close(session: TerminalSession): Promise<void> {
    return this.closeOnce(session, () => this.closeNow(session));
  }

  /** Für einen fehlgeschlagenen Create ohne erneuten Close-Mutationsaufruf. */
  discard(session: TerminalSession): Promise<void> {
    return this.closeOnce(session, () => this.discardNow(session));
  }

  /** Ein neu gestarteter Prozess darf nicht vom Retry eines alten Close gekillt werden. */
  adopt(session: TerminalSession): void {
    if (session.supervisorName) this.pendingTerminations.delete(session.supervisorName);
  }

  /** Panes, deren Löschung noch aussteht. Sie dürfen nicht als neue Session
   *  importiert werden, solange der Close nicht endgültig durch ist. */
  pendingSupervisorNames(): ReadonlySet<string> {
    return new Set(this.pendingTerminations);
  }

  /** Ein verworfenes Runtime-Terminate ist fehlgeschlagen; Retry und Import-
   *  Sperre greifen wie bei einem normalen Close. */
  rememberPendingTermination(name: string): void {
    this.pendingTerminations.add(name);
    this.deps.invalidateSupervisorSnapshot();
  }

  async drainWorkspaceCleanups(): Promise<void> {
    await Promise.allSettled([...this.workspaceCleanups]);
    await this.retryPendingTerminations();
  }

  /** Ein fehlgeschlagener Close darf keine aktive, aber unsichtbare tmux-Pane zurücklassen. */
  async retryPendingTerminations(): Promise<void> {
    if (!this.deps.supervisor) return;
    const liveNames = new Set([...this.deps.sessions.values()]
      .filter((session) => session.status !== "closed" && session.supervisorName)
      .map((session) => session.supervisorName));
    for (const name of [...this.pendingTerminations]) {
      if (liveNames.has(name)) { this.pendingTerminations.delete(name); continue; }
      try {
        await this.deps.supervisor.terminate(name);
        this.pendingTerminations.delete(name);
        // Der Scan-Cache könnte die beendete Pane noch enthalten. Ohne
        // Invalidierung würde der nächste Listen-Aufruf eine Geistersitzung
        // aus dem bereits gelöschten Pane-Stand importieren.
        this.deps.invalidateSupervisorSnapshot();
      } catch { /* Beim nächsten Listen oder Create erneut versuchen. */ }
    }
  }

  private closeOnce(session: TerminalSession, action: () => Promise<void>): Promise<void> {
    const active = this.closings.get(session.id);
    if (active) return active;
    const operation = action().finally(() => {
      if (this.closings.get(session.id) === operation) this.closings.delete(session.id);
    });
    this.closings.set(session.id, operation);
    return operation;
  }

  private async closeNow(session: TerminalSession): Promise<void> {
    if (this.finalized.has(session)) return;
    try {
      if (session.status !== "closed") {
        session.status = "closed";
        session.sequence += 1;
        session.updatedAt = Date.now();
        try {
          this.deps.emit(session, {
            type: "terminal.exited",
            sessionId: session.id,
            exitCode: session.exitCode,
            signal: session.exitSignal,
            sequence: session.sequence,
          });
        } catch { /* Ein defekter Client darf das Aufräumen nicht blockieren. */ }
      }
      await this.stopRuntime(session);
    } finally {
      this.finalize(session);
    }
  }

  private async discardNow(session: TerminalSession): Promise<void> {
    if (this.finalized.has(session)) return;
    session.status = "closed";
    try {
      await this.stopRuntime(session);
    } finally {
      this.finalize(session);
    }
  }

  private async stopRuntime(session: TerminalSession): Promise<void> {
    const supervisorName = session.supervisorName;
    try {
      await this.deps.process.stopProcess(session, true);
    } catch {
      // Registry und Clients werden trotzdem geräumt; die tmux-Pane bleibt
      // vorgemerkt, damit sie kein zweites Mal sichtbar wird.
      if (supervisorName) this.pendingTerminations.add(supervisorName);
    }
  }

  private finalize(session: TerminalSession): void {
    // Nach dem await darf nur die aktuelle Generation aufräumen. Ein bereits
    // abgeschlossener Close bleibt idempotent.
    if (this.finalized.has(session)) return;
    this.finalized.add(session);
    finalizeSession(this.deps, session);
  }

  private queueWorkspaceCleanup(change: TerminalWorkspaceChange): void {
    if (this.stopped || !change.removedRuntimeIds?.length) return;
    const cleanup = Promise.all(change.removedRuntimeIds.map(async (runtimeId) => {
      const session = this.deps.findByRuntime(change.userId, runtimeId);
      if (!session) return;
      // Zwischen Meldung und await kann ein neuerer Save dieselbe Runtime wieder
      // aufgenommen haben. Nur der aktuelle Workspace entscheidet über Close.
      if (this.deps.database?.isRuntimeReferenced(change.userId, runtimeId)) return;
      try { await this.deps.close(session); }
      catch { /* Close hat Registry und Clients bereits geräumt; tmux wird später erneut versucht. */ }
    })).then(() => undefined);
    this.workspaceCleanups.add(cleanup);
    void cleanup.finally(() => this.workspaceCleanups.delete(cleanup)).catch(() => {});
  }
}

/** Fährt beim Backend-Ende alle Sessions herunter, ohne lebende tmux-Panes zu verlieren. */
export async function shutdownSessions(deps: {
  process: Pick<ProcessRuntime, "stopProcess">;
  supervisor: TmuxSupervisor | undefined;
  sessions: Map<string, TerminalSession>;
  persist(session: TerminalSession): void;
}): Promise<void> {
  let liveSupervisorNames = new Set<string>();
  try { liveSupervisorNames = new Set((await deps.supervisor?.list() ?? []).map((session) => session.name)); }
  catch { /* Ohne Scan gelten alle Sessions als unterbrochen. */ }
  for (const session of [...deps.sessions.values()]) {
    if (session.status === "closed") continue;
    await deps.process.stopProcess(session, false);
    session.status = session.supervisorName && liveSupervisorNames.has(session.supervisorName) ? "running" : "interrupted";
    session.lastPersistedAt = undefined;
    session.updatedAt = Date.now();
    deps.persist(session);
    session.clients.clear();
    session.clientViewports.clear();
    session.primaryClientId = null;
    session.headless?.dispose();
    session.headless = null;
  }
  deps.sessions.clear();
}
