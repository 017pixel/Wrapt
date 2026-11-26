import { homedir } from "node:os";
import { isAbsolute, resolve } from "node:path";
import { kill } from "node:process";
import type { PtyAdapter, PtyProcess } from "./NodePtyAdapter.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";
import type { ServerTerminalMessage, TerminalKind } from "./protocol.js";
import {
  createRecoveryCoordinator, ensureSupervisedSession, exitEventForPane, isCleanPaneExit,
  readPaneStatus, RESPAWN_STABLE_MS, respawnSupervisedSession, type ExitEvent,
} from "./recovery.js";
import { createHeadlessTerminal } from "./runtime/HeadlessTerminal.js";
import { resetRuntimeScreen } from "./runtime/recoveryState.js";
import { discardUnclaimedRuntime, hasLiveSupervisorOwner } from "./runtimeOwnership.js";
import { TerminalFailure, type TerminalSession } from "./session.js";
import { broadcastSnapshot, limitHistory } from "./snapshots.js";
import { resolveTerminalCliCommand, resolveTerminalShell, terminalShellEnvironment, type TerminalShellConfiguration } from "./shell.js";

export interface ProcessRuntimeDependencies {
  adapter: PtyAdapter;
  supervisor: TmuxSupervisor | undefined;
  homeDirectory: string | undefined;
  shell?: TerminalShellConfiguration;
  platform?: NodeJS.Platform;
  cliPaths: Partial<Record<Exclude<TerminalKind, "shell">, string>> | undefined;
  onOutput: ((session: Readonly<TerminalSession>, data: string) => void) | undefined;
  persist(session: TerminalSession): void;
  emit(session: TerminalSession, message: ServerTerminalMessage): void;
  cwdRefreshTimers: Map<string, NodeJS.Timeout>;
  /** Erneute kanonische CWD-Prüfung unmittelbar vor jedem Prozessstart. */
  validateCwd(session: TerminalSession): string;
  /** Prüft, ob eine lebende Session denselben Supervisor-Namen nutzt. */
  hasLiveSupervisorOwner?(name: string): boolean;
  /** Wird nach dem Entfernen einer verworfenen Runtime aufgerufen (Cache). */
  onRuntimeDiscarded?(name: string): void;
  /** Terminate einer verworfenen Runtime schlug fehl: Name für Retry merken. */
  onRuntimeDiscardFailed?(name: string): void;
}

export interface ProcessRuntime {
  kindLabel(kind: TerminalKind): string;
  launchCommand(kind: TerminalKind, mode: "agent" | "login"): { file: string; args: string[] };
  environment(session: TerminalSession): Record<string, string>;
  spawn(session: TerminalSession, resetOnCreate?: boolean): Promise<void>;
  write(session: TerminalSession, data: string): void;
  attachPty(session: TerminalSession, command: { file: string; args: string[] }, environment: Record<string, string>): void;
  handlePtyExit(session: TerminalSession, event: { exitCode: number; signal?: number }): Promise<void>;
  stopProcess(session: TerminalSession, terminateRuntime: boolean): Promise<void>;
  scheduleCwdRefresh(session: TerminalSession): void;
  shutdown(): Promise<void>;
}

interface AttachOptions { resetScreen?: boolean; history?: string; }

/** Bündelt den pane-bewussten PTY-Lebenszyklus und die gemeinsame Überwachung. */
export function createProcessRuntime(deps: ProcessRuntimeDependencies): ProcessRuntime {
  const isClosed = (session: TerminalSession) => session.status === "closed";
  let shuttingDown = false;
  const pending = new Set<Promise<void>>();
  const trackedSessions = new Map<string, TerminalSession>();
  const spawningSessions = new Set<string>();
  const { adapter, cliPaths, onOutput, persist, emit, cwdRefreshTimers, validateCwd } = deps;
  const supervisor = deps.supervisor;
  const platform = deps.platform ?? process.platform;
  const shell = resolveTerminalShell(deps.shell, platform);

  /** Ein neu erzeugtes Pane darf nicht stehen bleiben, wenn die Session es
   *  nach einem Close oder einer neuen Generation nicht mehr übernimmt. */
  const discardRuntime = (session: TerminalSession, name: string, created: boolean) => discardUnclaimedRuntime(
    supervisor,
    name,
    created,
    session.status !== "closed" || (deps.hasLiveSupervisorOwner?.(name) ?? hasLiveSupervisorOwner(trackedSessions.values(), name)),
    deps.onRuntimeDiscarded,
    deps.onRuntimeDiscardFailed,
  );

  const track = (operation: Promise<void>) => {
    pending.add(operation);
    void operation.finally(() => pending.delete(operation)).catch(() => {});
    return operation;
  };

  function kindLabel(kind: TerminalKind) {
    return kind === "codex" ? "Codex" : kind === "opencode" ? "OpenCode" : kind === "claude" ? "Claude Code" : "Terminal";
  }

  function launchCommand(kind: TerminalKind, mode: "agent" | "login"): { file: string; args: string[] } {
    if (kind === "shell") return shell;
    return resolveTerminalCliCommand(cliPaths?.[kind] ?? kind, mode === "login" ? (kind === "codex" ? ["login", "--device-auth"] : ["auth", "login"]) : [], platform);
  }

  function environment(session: TerminalSession): Record<string, string> {
    const env = terminalShellEnvironment(shell, deps.homeDirectory, platform);
    if (session.kind !== "shell") { delete env.PROMPT_COMMAND; delete env.PROMPT; }
    if (session.profilePath && session.kind === "codex") return { ...env, CODEX_HOME: session.profilePath };
    if (session.profilePath && session.kind === "opencode") return { ...env, XDG_DATA_HOME: session.profilePath };
    if (session.profilePath && session.kind === "claude" && resolve(session.profilePath) !== resolve(homedir(), ".claude")) return { ...env, CLAUDE_CONFIG_DIR: session.profilePath };
    return env;
  }

  function detachGateway(session: TerminalSession, expected: PtyProcess | null = session.pty, terminateClient = true): boolean {
    if (session.pty !== expected) return false;
    const pty = session.pty;
    session.dataListener?.dispose();
    session.exitListener?.dispose();
    session.dataListener = null;
    session.exitListener = null;
    session.pty = null;
    session.pid = 0;
    if (terminateClient && pty) { try { pty.kill(platform === "win32" ? undefined : "SIGTERM"); } catch { /* Client ist bereits weg. */ } }
    return true;
  }

  function resetScreenIfNeeded(session: TerminalSession, force: boolean): boolean {
    if (!force && session.headless) return false;
    const alreadyReset = session.status === "starting" && session.epoch > 0 && session.sequence === 0
      && session.journal.size === 0 && session.history === "";
    const hadRuntime = session.epoch > 0 || session.sequence > 0 || session.journal.size > 0
      || session.history.length > 0 || session.headless !== null;
    resetRuntimeScreen(session, hadRuntime && !alreadyReset);
    return true;
  }

  function attachPty(session: TerminalSession, command: { file: string; args: string[] }, nextEnvironment: Record<string, string>, options: AttachOptions = {}): void {
    if (session.pty) detachGateway(session);
    const rebuild = resetScreenIfNeeded(session, options.resetScreen ?? false);
    session.history = limitHistory(options.history ?? session.history);
    if (!session.headless) {
      const headless = createHeadlessTerminal(session.cols, session.rows, (cwd) => {
        if (session.headless !== headless || session.status !== "running" || cwd === session.cwd) return;
        session.cwd = cwd;
        session.updatedAt = Date.now();
        session.lastPersistedAt = undefined;
        persist(session);
        emit(session, { type: "terminal.cwd", sessionId: session.id, cwd });
      });
      session.headless = headless;
    } else if (session.headless.cols !== session.cols || session.headless.rows !== session.rows) session.headless.resize(session.cols, session.rows);
    if (rebuild && session.history) {
      session.sequence = 1;
      session.headless.write(session.history, session.sequence);
      session.journal.push({ sequence: session.sequence, data: session.history });
    }
    const pty = adapter.spawn(command.file, command.args, {
      name: "xterm-256color", cwd: session.cwd, cols: session.cols, rows: session.rows, env: nextEnvironment,
      ...(platform === "win32" ? { useConpty: true } : {}),
    });
    session.pty = pty;
    session.pid = pty.pid;
    session.status = "running";
    session.updatedAt = Date.now();
    session.lastPersistedAt = undefined;
    persist(session);
    const state = recovery.state(session);
    if (state.stable) clearTimeout(state.stable);
    state.stable = setTimeout(() => {
      if (!shuttingDown && session.status === "running") state.attempts = 0;
      state.stable = null;
    }, RESPAWN_STABLE_MS);
    state.stable.unref();
    const epoch = session.epoch;
    session.dataListener = pty.onData((data) => {
      if (session.pty !== pty || session.epoch !== epoch || isClosed(session)) return;
      session.history = limitHistory(session.history + data);
      session.sequence += 1;
      session.updatedAt = Date.now();
      session.headless?.write(data, session.sequence);
      session.journal.push({ sequence: session.sequence, data });
      persist(session);
      emit(session, { type: "terminal.output", sessionId: session.id, data, sequence: session.sequence });
      scheduleCwdRefresh(session);
      onOutput?.(session, data);
    });
    session.exitListener = pty.onExit((event) => {
      if (session.pty !== pty || session.epoch !== epoch || isClosed(session) || session.status === "interrupted") return;
      void track(handlePtyExit(session, event, pty)).catch(() => {});
    });
    try { for (const data of state.input.drain()) pty.write(data); }
    catch (error) { detachGateway(session, pty); throw error; }
  }

  function emitExited(session: TerminalSession): void {
    emit(session, { type: "terminal.exited", sessionId: session.id, exitCode: session.exitCode, signal: session.exitSignal, sequence: session.sequence });
  }

  function markExited(session: TerminalSession, event: ExitEvent): void {
    if (isClosed(session)) return;
    detachGateway(session, session.pty, false);
    recovery.clear(session, true);
    trackedSessions.delete(session.id);
    session.status = "exited";
    session.exitCode = event.exitCode;
    session.exitSignal = event.signal ?? null;
    session.sequence += 1;
    session.updatedAt = Date.now();
    persist(session);
    emitExited(session);
  }

  function markInterrupted(session: TerminalSession, event: ExitEvent): void {
    if (isClosed(session)) return;
    detachGateway(session, session.pty, false);
    recovery.clear(session, true);
    trackedSessions.delete(session.id);
    session.status = "interrupted";
    session.exitCode = event.exitCode;
    session.exitSignal = event.signal ?? null;
    session.sequence += 1;
    session.updatedAt = Date.now();
    persist(session);
    emit(session, { type: "terminal.error", sessionId: session.id, code: "SESSION_INTERRUPTED", message: "Der Prozess wurde mehrfach unerwartet beendet und nicht erneut gestartet. Starte die Sitzung manuell neu." });
    emitExited(session);
  }

  const recovery = createRecoveryCoordinator({
    supervisor, isClosed, sessions: () => trackedSessions.values(), isSpawning: (session) => spawningSessions.has(session.id), validateCwd,
    launchCommand: (session) => ({ ...launchCommand(session.kind, session.mode), environment: environment(session) }),
    environment,
    hasLiveSupervisorOwner: (name) => deps.hasLiveSupervisorOwner?.(name)
      ?? hasLiveSupervisorOwner(trackedSessions.values(), name),
    ...(deps.onRuntimeDiscarded ? { onRuntimeDiscarded: deps.onRuntimeDiscarded } : {}),
    attach: (session, history, env, resetScreen) => attachPty(session, supervisor!.attachCommand(session.supervisorName!), env, { history, resetScreen }),
    detach: (session, gateway) => { detachGateway(session, gateway); },
    broadcast: (session) => broadcastSnapshot(session, supervisor),
    markExited, markInterrupted, persist, emit, track,
    ...(deps.onRuntimeDiscarded ? { onRuntimeDiscarded: deps.onRuntimeDiscarded } : {}),
    ...(deps.onRuntimeDiscardFailed ? { onRuntimeDiscardFailed: deps.onRuntimeDiscardFailed } : {}),
  });

  async function handlePtyExit(session: TerminalSession, event: ExitEvent, expected: PtyProcess | null = session.pty): Promise<void> {
    if (shuttingDown || isClosed(session) || session.pty !== expected) return;
    detachGateway(session, expected, false);
    await recovery.exit(session, event);
  }

  async function spawn(session: TerminalSession, resetOnCreate = false): Promise<void> {
    try {
      if (shuttingDown || isClosed(session)) throw new Error("Terminalstart wurde beendet.");
      recovery.clear(session, resetOnCreate);
      if (session.pty) detachGateway(session);
      const epoch = session.epoch;
      trackedSessions.set(session.id, session);
      spawningSessions.add(session.id);
      recovery.startMonitor();
      const launch = launchCommand(session.kind, session.mode);
      const nextEnvironment = environment(session);
      let command = launch;
      let history = "";
      let newRuntime = !supervisor || resetOnCreate;
      if (supervisor) {
        const previousName = session.supervisorName;
        const ensured = await ensureSupervisedSession(supervisor, { runtimeId: session.runtimeId, kind: session.kind, projectId: session.projectId, supervisorName: previousName, cwd: session.cwd, command: { ...launch, environment: nextEnvironment } });
        if (shuttingDown || isClosed(session) || session.epoch !== epoch || session.pty) {
          await discardRuntime(session, ensured.name, ensured.created);
          throw new Error("Terminalstart wurde verworfen.");
        }
        session.supervisorName = ensured.name;
        // Jede Wiederanbindung an eine bestehende Pane beginnt mit einem
        // frischen tmux-Capture; alte Headless-Deltas gehören nicht dazu.
        newRuntime = resetOnCreate || ensured.created || Boolean(previousName);
        if (resetOnCreate && !ensured.created) {
          const respawned = await respawnSupervisedSession(supervisor, ensured.name, session.cwd, { ...launch, environment: nextEnvironment }, { runtimeId: session.runtimeId, kind: session.kind, projectId: session.projectId });
          if (shuttingDown || isClosed(session) || session.epoch !== epoch || session.pty) {
            await discardRuntime(session, ensured.name, respawned.created);
            throw new Error("Terminalstart wurde verworfen.");
          }
        } else if (previousName && !newRuntime) {
          const pane = await readPaneStatus(supervisor, ensured.name);
          if (shuttingDown || isClosed(session) || session.epoch !== epoch || session.pty) throw new Error("Terminalstart wurde verworfen.");
          if (isCleanPaneExit(pane)) { markExited(session, exitEventForPane(pane, 0)); return; }
          if (pane.state === "dead" || pane.state === "missing") { await recovery.request(session, { pane, event: exitEventForPane(pane) }); return; }
          if (pane.state === "unknown") throw new Error("Pane-Zustand ist unbekannt.");
        }
        history = limitHistory(await supervisor.capture(ensured.name));
        if (shuttingDown || isClosed(session) || session.epoch !== epoch || session.pty) throw new Error("Terminalstart wurde verworfen.");
        command = supervisor.attachCommand(ensured.name);
      }
      attachPty(session, command, nextEnvironment, { resetScreen: newRuntime, history });
    } catch (error) {
      if (session.kind !== "shell" && (error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new TerminalFailure("CLI_NOT_FOUND", `${kindLabel(session.kind)} ist nicht installiert oder nicht im PATH auffindbar.`);
      }
      throw new TerminalFailure("PTY_SPAWN_FAILED", "Die Shell konnte nicht gestartet werden.");
    } finally { spawningSessions.delete(session.id); }
  }

  function write(session: TerminalSession, data: string): void {
    if (isClosed(session)) throw new TerminalFailure("SESSION_ALREADY_CLOSED", "Die Terminalsitzung ist bereits beendet.");
    if (session.status === "starting" || (session.status === "running" && !session.pty)) {
      recovery.state(session).input.push(data);
      session.updatedAt = Date.now();
      session.lastPersistedAt = undefined;
      persist(session);
      return;
    }
    if (session.status !== "running" || !session.pty) throw new TerminalFailure(session.status === "interrupted" ? "SESSION_INTERRUPTED" : "TERMINAL_NOT_RUNNING", "Das Terminal läuft nicht.");
    try { session.pty.write(data); session.updatedAt = Date.now(); persist(session); }
    catch { throw new TerminalFailure("PTY_WRITE_FAILED", "Die Eingabe konnte nicht an das Terminal gesendet werden."); }
  }

  async function stopProcess(session: TerminalSession, terminateRuntime: boolean): Promise<void> {
    recovery.clear(session, true);
    const pid = session.pid;
    detachGateway(session);
    if ((platform === "linux" || platform === "darwin") && pid > 0) {
      try { kill(-pid, "SIGTERM"); } catch { /* Prozessgruppe ist bereits weg. */ }
      const forceKill = setTimeout(() => { try { kill(-pid, "SIGKILL"); } catch { /* Prozessgruppe ist bereits weg. */ } }, 1_000);
      forceKill.unref();
    }
    trackedSessions.delete(session.id);
    if (terminateRuntime && supervisor && session.supervisorName) {
      const name = session.supervisorName;
      await supervisor.terminate(name);
      if (session.supervisorName === name) session.supervisorName = null;
    }
  }

  function scheduleCwdRefresh(session: TerminalSession): void {
    if (shuttingDown || !supervisor || !session.supervisorName || session.kind !== "shell") return;
    const pendingRefresh = cwdRefreshTimers.get(session.id);
    if (pendingRefresh) clearTimeout(pendingRefresh);
    const timer = setTimeout(async () => {
      cwdRefreshTimers.delete(session.id);
      if (!session.supervisorName) return;
      const name = session.supervisorName;
      const cwd = await Promise.resolve(supervisor.currentPath(name)).catch(() => null);
      if (shuttingDown || session.supervisorName !== name || session.status !== "running") return;
      if (!cwd || cwd === session.cwd || !isAbsolute(cwd)) return;
      session.cwd = cwd;
      session.updatedAt = Date.now();
      session.lastPersistedAt = undefined;
      persist(session);
      emit(session, { type: "terminal.cwd", sessionId: session.id, cwd });
    }, 80);
    timer.unref();
    cwdRefreshTimers.set(session.id, timer);
  }

  return {
    kindLabel, launchCommand, environment,
    spawn: (session, resetOnCreate) => track(spawn(session, resetOnCreate)), write,
    attachPty, handlePtyExit: (session, event) => handlePtyExit(session, event), stopProcess, scheduleCwdRefresh,
    shutdown: async () => {
      shuttingDown = true;
      recovery.shutdown();
      await Promise.allSettled(pending);
    },
  };
}
