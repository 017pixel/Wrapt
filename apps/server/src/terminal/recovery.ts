import type { PtyProcess } from "./NodePtyAdapter.js";
import type {
  EnsureSupervisorInput, PaneStatus, SupervisedCommand, SupervisorMetadata, SupervisorSession,
} from "./TmuxSupervisor.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { PendingInputBuffer, type RespawnState } from "./runtime/recoveryState.js";
import { discardUnclaimedRuntime, hasLiveSupervisorOwner } from "./runtimeOwnership.js";
import type { TerminalSession } from "./session.js";

export type {
  EnsureSupervisorInput, PaneState, PaneStatus, SupervisedCommand, SupervisorMetadata,
} from "./TmuxSupervisor.js";

export const RESPAWN_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000] as const;
export const RESPAWN_MAX_ATTEMPTS = 5;
export const RESPAWN_STABLE_MS = 60_000;
export const RECOVERY_MONITOR_INTERVAL_MS = 1_000;
export const PENDING_INPUT_LIMIT = 64 * 1024;

export interface ExitEvent { exitCode: number; signal?: number; }
export interface EnsureSupervisorResult { name: string; created: boolean; }
export interface RespawnSupervisorResult { created: boolean; }
export interface RecoveryScan { available: boolean; sessions: readonly SupervisorSession[]; }

/**
 * Strukturelle Schnittstelle zum tmux-Supervisor. `TmuxSupervisor` erfüllt sie
 * direkt; Tests können eine kleine Fake-Implementierung einsetzen.
 */
export interface RecoverySupervisor {
  scan?(): Promise<RecoveryScan> | RecoveryScan;
  paneStatus?(name: string): Promise<PaneStatus> | PaneStatus;
  ensureSupervisorUnit?(): Promise<boolean> | boolean;
  ensureWithStatus?(input: EnsureSupervisorInput): Promise<EnsureSupervisorResult> | EnsureSupervisorResult;
  respawnWithStatus?(name: string, cwd: string, command: SupervisedCommand, metadata: SupervisorMetadata): Promise<RespawnSupervisorResult> | RespawnSupervisorResult;
  ensure(input: EnsureSupervisorInput): Promise<string | EnsureSupervisorResult> | string | EnsureSupervisorResult;
  respawn(name: string, cwd: string, command: SupervisedCommand): Promise<unknown> | unknown;
  has(name: string): Promise<boolean> | boolean;
  capture(name: string): Promise<string> | string;
  attachCommand(name: string): { file: string; args: string[] };
  currentPath(name: string): Promise<string | null> | string | null;
  terminate(name: string): Promise<void> | void;
}

/** Exit 0 ohne Signal ist ein echter, sauberer Abschluss der Pane. */
export function isCleanPaneExit(pane: PaneStatus): boolean {
  return pane.state === "dead" && pane.exitCode === 0 && (pane.exitSignal ?? 0) === 0;
}

export function exitEventForPane(pane: PaneStatus, fallback = 1): ExitEvent {
  const signal = pane.exitSignal ?? 0;
  return { exitCode: pane.exitCode ?? fallback, ...(signal !== 0 ? { signal } : {}) };
}

/** Ein Scan liefert den Pane-Zustand samt Exit-Metadaten in einem Aufruf. */
export function paneStatusFromScan(entry: SupervisorSession): PaneStatus {
  if (!entry.dead) return { state: "alive", exitCode: null };
  const signal = entry.exitSignal ?? 0;
  return { state: "dead", exitCode: entry.exitCode, ...(signal !== 0 ? { exitSignal: signal } : {}) };
}

export async function readPaneStatus(supervisor: RecoverySupervisor, name: string): Promise<PaneStatus> {
  if (!supervisor.paneStatus) return { state: "unknown", exitCode: null };
  try {
    const pane = await supervisor.paneStatus(name);
    return { state: pane.state, exitCode: pane.exitCode, ...(pane.exitSignal ? { exitSignal: pane.exitSignal } : {}) };
  } catch { return { state: "unknown", exitCode: null }; }
}

export async function scanPaneStatuses(supervisor: RecoverySupervisor, names: readonly string[]): Promise<Map<string, PaneStatus>> {
  const result = new Map<string, PaneStatus>();
  if (!supervisor.scan || names.length === 0) return result;
  let scan: RecoveryScan;
  try { scan = await supervisor.scan(); }
  catch { return result; }
  if (!scan.available) {
    for (const name of names) result.set(name, { state: "missing", exitCode: null });
    return result;
  }
  const scanned = new Map(scan.sessions.map((entry) => [entry.name, paneStatusFromScan(entry)]));
  for (const name of names) result.set(name, scanned.get(name) ?? { state: "missing", exitCode: null });
  return result;
}

export async function ensureSupervisedSession(supervisor: RecoverySupervisor, input: EnsureSupervisorInput): Promise<EnsureSupervisorResult> {
  if (supervisor.ensureWithStatus) return supervisor.ensureWithStatus(input);
  const name = input.supervisorName ?? `workbench-${input.runtimeId.replaceAll("-", "")}`;
  const existed = await supervisor.has(name);
  const ensured = await supervisor.ensure(input);
  return typeof ensured === "string" ? { name: ensured, created: !existed } : ensured;
}

export async function respawnSupervisedSession(supervisor: RecoverySupervisor, name: string, cwd: string, command: SupervisedCommand, metadata: SupervisorMetadata): Promise<RespawnSupervisorResult> {
  if (supervisor.respawnWithStatus) return supervisor.respawnWithStatus(name, cwd, command, metadata);
  const existed = await supervisor.has(name);
  await supervisor.respawn(name, cwd, command);
  return { created: !existed };
}

async function paneExists(supervisor: RecoverySupervisor, name: string): Promise<boolean> {
  try { return await supervisor.has(name); }
  catch { return false; }
}

interface RecoveryTrigger { pane: PaneStatus; event: ExitEvent; }
interface RecoveryContext { epoch: number; gateway: PtyProcess | null; state: RespawnState; name: string; }

export interface RecoveryCoordinatorDeps {
  supervisor: RecoverySupervisor | undefined;
  isClosed(session: TerminalSession): boolean;
  sessions(): Iterable<TerminalSession>;
  isSpawning(session: TerminalSession): boolean;
  validateCwd(session: TerminalSession): string;
  launchCommand(session: TerminalSession): SupervisedCommand;
  environment(session: TerminalSession): Record<string, string>;
  /** Prüft, ob eine lebende Session denselben Supervisor-Namen nutzt. */
  hasLiveSupervisorOwner?(name: string): boolean;
  /** Wird nach dem Entfernen einer verworfenen Runtime aufgerufen (Cache). */
  onRuntimeDiscarded?(name: string): void;
  /** Terminate einer verworfenen Runtime schlug fehl: Name für Retry merken. */
  onRuntimeDiscardFailed?(name: string): void;
  attach(session: TerminalSession, history: string, environment: Record<string, string>, resetScreen: boolean): void;
  detach(session: TerminalSession, gateway: PtyProcess): void;
  broadcast(session: TerminalSession): Promise<void>;
  markExited(session: TerminalSession, event: ExitEvent): void;
  markInterrupted(session: TerminalSession, event: ExitEvent): void;
  persist(session: TerminalSession): void;
  emit(session: TerminalSession, message: ServerTerminalMessage): void;
  track(operation: Promise<void>): Promise<void>;
}

/** Ein Monitor und eine Recovery-Operation pro Session verhindern Doppelstarts. */
export function createRecoveryCoordinator(deps: RecoveryCoordinatorDeps) {
  const states = new Map<string, RespawnState>();
  const operations = new Map<string, Promise<void>>();
  let monitor: NodeJS.Timeout | null = null;
  let scanning = false;
  let stopped = false;

  const state = (session: TerminalSession): RespawnState => {
    let current = states.get(session.id);
    if (!current) {
      current = { attempts: 0, timer: null, stable: null, input: new PendingInputBuffer(PENDING_INPUT_LIMIT) };
      states.set(session.id, current);
    }
    return current;
  };

  /** Stoppt Timer und Zähler. Nur ein echter Laufzeitabbau verwirft Puffer-Eingaben. */
  const clear = (session: TerminalSession, clearInput = false) => {
    const current = states.get(session.id);
    if (!current) return;
    if (current.timer) clearTimeout(current.timer);
    if (current.stable) clearTimeout(current.stable);
    current.timer = null;
    current.stable = null;
    current.attempts = 0;
    if (!clearInput) return;
    current.input.clear();
    states.delete(session.id);
  };

  const isCurrent = (session: TerminalSession, context: RecoveryContext) =>
    !stopped && !deps.isClosed(session) && session.epoch === context.epoch
    && session.pty === context.gateway && states.get(session.id) === context.state
    && !deps.isSpawning(session);

  const metadata = (session: TerminalSession): SupervisorMetadata =>
    ({ runtimeId: session.runtimeId, kind: session.kind, projectId: session.projectId });

  /** Nach jedem Ensure/Respawn prüfen: Eine neu erzeugte Pane, die keine
   *  lebende Session mehr übernimmt, wird sofort wieder entfernt. */
  const discardRuntime = (session: TerminalSession, name: string, created: boolean) => discardUnclaimedRuntime(
    deps.supervisor,
    name,
    created,
    session.status !== "closed" || (deps.hasLiveSupervisorOwner?.(name) ?? hasLiveSupervisorOwner(deps.sessions(), name)),
    deps.onRuntimeDiscarded,
    deps.onRuntimeDiscardFailed,
  );

  function scheduleRespawn(session: TerminalSession, trigger: RecoveryTrigger, context: RecoveryContext): void {
    if (!isCurrent(session, context) || context.state.timer) return;
    if (context.state.stable) { clearTimeout(context.state.stable); context.state.stable = null; }
    if (context.state.attempts >= RESPAWN_MAX_ATTEMPTS) { deps.markInterrupted(session, trigger.event); return; }
    const delay = RESPAWN_DELAYS_MS[Math.min(context.state.attempts, RESPAWN_DELAYS_MS.length - 1)]!;
    context.state.attempts += 1;
    session.status = "starting";
    session.sequence += 1;
    session.updatedAt = Date.now();
    deps.emit(session, { type: "terminal.restarting", sessionId: session.id,
      reason: `Der Prozess wurde unerwartet beendet. Neuer Versuch ${context.state.attempts} von ${RESPAWN_MAX_ATTEMPTS} in ${Math.round(delay / 1_000)} s.`,
      sequence: session.sequence });
    context.state.timer = setTimeout(() => {
      context.state.timer = null;
      if (isCurrent(session, context)) void deps.track(attemptRespawn(session, trigger, context)).catch(() => {});
    }, delay);
    context.state.timer.unref();
  }

  async function reattachGateway(session: TerminalSession, context: RecoveryContext): Promise<void> {
    if (!isCurrent(session, context) || !deps.supervisor) return;
    const history = await deps.supervisor.capture(context.name);
    if (!isCurrent(session, context)) return;
    // Der alte Headless-Stand hat während des Client-Abrisses keine neuen
    // Bytes gesehen. Der frische tmux-Capture ist jetzt autoritativ.
    deps.attach(session, history, deps.environment(session), true);
    await deps.broadcast(session);
  }

  async function attemptRespawn(session: TerminalSession, trigger: RecoveryTrigger, context: RecoveryContext): Promise<void> {
    if (!isCurrent(session, context) || !deps.supervisor) return;
    try {
      session.cwd = deps.validateCwd(session);
      await deps.supervisor.ensureSupervisorUnit?.();
      if (!isCurrent(session, context)) return;
      const pane = deps.supervisor.paneStatus ? await readPaneStatus(deps.supervisor, context.name) : trigger.pane;
      if (!isCurrent(session, context)) return;
      if (pane.state === "alive") { await reattachGateway(session, context); return; }
      if (isCleanPaneExit(pane)) { deps.markExited(session, exitEventForPane(pane, 0)); return; }
      if (pane.state === "unknown") throw new Error("Pane-Zustand ist unbekannt.");
      const command = deps.launchCommand(session);
      if (pane.state === "missing") {
        const ensured = await ensureSupervisedSession(deps.supervisor, { ...metadata(session), supervisorName: context.name, cwd: session.cwd, command });
        if (!isCurrent(session, context)) { await discardRuntime(session, ensured.name, ensured.created); return; }
        session.supervisorName = ensured.name;
        if (!ensured.created) {
          const current = await readPaneStatus(deps.supervisor, ensured.name);
          if (!isCurrent(session, context)) return;
          if (current.state === "alive") { await reattachGateway(session, context); return; }
          if (isCleanPaneExit(current)) { deps.markExited(session, exitEventForPane(current, 0)); return; }
          if (current.state === "dead") {
            const respawned = await respawnSupervisedSession(deps.supervisor, ensured.name, session.cwd, command, metadata(session));
            if (!isCurrent(session, context)) { await discardRuntime(session, ensured.name, respawned.created); return; }
          } else throw new Error("Pane konnte nicht wiederhergestellt werden.");
        }
      } else {
        const respawned = await respawnSupervisedSession(deps.supervisor, context.name, session.cwd, command, metadata(session));
        if (!isCurrent(session, context)) { await discardRuntime(session, context.name, respawned.created); return; }
      }
      const history = await deps.supervisor.capture(context.name);
      if (!isCurrent(session, context)) return;
      deps.attach(session, history, command.environment, true);
      await deps.broadcast(session);
    } catch {
      if (isCurrent(session, context)) scheduleRespawn(session, trigger, context);
    }
  }

  function singleFlight(session: TerminalSession, action: () => Promise<void>): Promise<void> {
    const active = operations.get(session.id);
    if (active) return active;
    const operation = action();
    operations.set(session.id, operation);
    void operation.finally(() => { if (operations.get(session.id) === operation) operations.delete(session.id); }).catch(() => {});
    return operation;
  }

  function request(session: TerminalSession, trigger: RecoveryTrigger): Promise<void> {
    return singleFlight(session, async () => {
      const context: RecoveryContext = { epoch: session.epoch, gateway: session.pty, state: state(session), name: session.supervisorName ?? "" };
      if (!isCurrent(session, context)) return;
      if (trigger.pane.state === "alive") {
        try { await reattachGateway(session, context); }
        catch { if (isCurrent(session, context)) scheduleRespawn(session, trigger, context); }
        return;
      }
      if (isCleanPaneExit(trigger.pane)) { deps.markExited(session, exitEventForPane(trigger.pane, 0)); return; }
      scheduleRespawn(session, trigger, context);
    });
  }

  async function exit(session: TerminalSession, event: ExitEvent): Promise<void> {
    if (stopped || deps.isClosed(session) || !deps.supervisor || !session.supervisorName) { deps.markExited(session, event); return; }
    session.status = "starting";
    session.updatedAt = Date.now();
    session.lastPersistedAt = undefined;
    deps.persist(session);
    let pane: PaneStatus;
    if (deps.supervisor.paneStatus) pane = await readPaneStatus(deps.supervisor, session.supervisorName);
    else if (deps.supervisor.scan) pane = (await scanPaneStatuses(deps.supervisor, [session.supervisorName])).get(session.supervisorName) ?? { state: "missing", exitCode: null };
    else pane = await paneExists(deps.supervisor, session.supervisorName) ? { state: "dead", exitCode: event.exitCode } : { state: "missing", exitCode: null };
    const context: RecoveryContext = { epoch: session.epoch, gateway: null, state: state(session), name: session.supervisorName };
    if (isCurrent(session, context)) await request(session, { pane, event });
  }

  async function scanSessions(): Promise<void> {
    if (stopped || scanning || !deps.supervisor?.scan) return;
    scanning = true;
    try {
      const candidates = [...deps.sessions()].filter((session) => !deps.isClosed(session)
        && session.status !== "exited" && session.status !== "interrupted" && session.supervisorName && !deps.isSpawning(session));
      const before = new Map(candidates.map((session) => [session.id, { session, epoch: session.epoch, gateway: session.pty }]));
      const statuses = await scanPaneStatuses(deps.supervisor, candidates.map((session) => session.supervisorName!));
      for (const captured of before.values()) {
        const session = captured.session;
        if (stopped || deps.isClosed(session) || session.status === "exited" || session.status === "interrupted"
          || session.epoch !== captured.epoch || session.pty !== captured.gateway || deps.isSpawning(session)) continue;
        const pane = statuses.get(session.supervisorName!);
        if (!pane || pane.state === "unknown") continue;
        if (pane.state === "alive") {
          if (!captured.gateway && session.status === "running" && !state(session).timer) void deps.track(request(session, { pane, event: { exitCode: 0 } })).catch(() => {});
          continue;
        }
        if (captured.gateway) deps.detach(session, captured.gateway);
        if (isCleanPaneExit(pane)) { deps.markExited(session, exitEventForPane(pane, 0)); continue; }
        session.status = "starting";
        session.updatedAt = Date.now();
        deps.persist(session);
        void deps.track(request(session, { pane, event: exitEventForPane(pane) })).catch(() => {});
      }
    } finally { scanning = false; }
  }

  return {
    state, clear, request, exit,
    startMonitor() {
      if (monitor || !deps.supervisor?.scan) return;
      monitor = setInterval(() => { void deps.track(scanSessions()).catch(() => {}); }, RECOVERY_MONITOR_INTERVAL_MS);
      monitor.unref();
    },
    shutdown() {
      stopped = true;
      if (monitor) clearInterval(monitor);
      monitor = null;
      for (const current of states.values()) {
        if (current.timer) clearTimeout(current.timer);
        if (current.stable) clearTimeout(current.stable);
        current.input.clear();
      }
      states.clear();
    },
  };
}
