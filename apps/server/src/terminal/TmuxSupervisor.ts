import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { execa } from "execa";
import { supportsSystemd } from "../system/platform.js";
import type { TerminalKind } from "./protocol.js";
import { ensurePrivateSocketDirectory, TERMINAL_SUPERVISOR_UNIT, terminalSupervisorStartArgs } from "./supervisorSocket.js";

export { defaultTerminalSocketPath, TERMINAL_SUPERVISOR_SESSION, TERMINAL_SUPERVISOR_UNIT, terminalSupervisorStartArgs } from "./supervisorSocket.js";

export interface SupervisedCommand {
  file: string;
  args: string[];
  environment: Record<string, string>;
}

export interface SupervisorMetadata {
  runtimeId: string;
  kind: TerminalKind;
  projectId: string | null;
}

export interface SupervisorSession {
  name: string;
  runtimeId: string | null;
  kind: TerminalKind;
  projectId: string | null;
  cwd: string;
  command: string;
  createdAt: number;
  managed: boolean;
  dead: boolean;
  exitCode: number | null;
  exitSignal: number | null;
}

export interface EnsureSupervisorInput extends SupervisorMetadata {
  supervisorName?: string | null;
  cwd: string;
  command: SupervisedCommand;
}

/**
 * Einheitlicher Pane-Zustand für Recovery und Terminal-Laufzeit. `paneStatus`
 * liefert immer dieses Objekt — nie einen nackten String.
 */
export type PaneState = "alive" | "dead" | "missing" | "unknown";
export interface PaneStatus {
  state: PaneState;
  exitCode: number | null;
  exitSignal?: number | null;
}

type TmuxRunner = (args: string[], timeout: number, signal: AbortSignal) => Promise<TmuxCommandResult> | TmuxCommandResult;

function shellQuote(value: string) { return `'${value.replaceAll("'", `'\\''`)}'`; }

function missingServer(result: TmuxCommandResult): boolean {
  return /no server running|error connecting to .*\((?:no such file or directory|connection refused)\)/i.test(result.stderr);
}

export class TmuxSupervisor {
  readonly kind = "tmux" as const;
  private spawnFailed = false;
  private availability: Promise<void> | null = null;
  private recovery: Promise<boolean> | null = null;
  private readonly abort = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly mutations = new Map<string, Promise<unknown>>();

  constructor(readonly executable: string, readonly socketPath: string | null = null,
    private readonly runner?: TmuxRunner, private readonly systemdRunner?: TmuxRunner,
    private readonly manageSystemdUnit = false) {
    if (socketPath) {
      try { ensurePrivateSocketDirectory(socketPath); } catch { /* Der Server versucht es später erneut. */ }
    }
  }

  /** Ergänzt den dedizierten Socket vor allen tmux-Argumenten. */
  private socketArgs(args: string[]): string[] {
    return this.socketPath ? ["-S", this.socketPath, ...args] : args;
  }

  /** Linux nutzt die User-Unit, macOS startet denselben tmux-Server detached. */
  ensureSupervisorUnit(): Promise<boolean> {
    this.recovery ??= this.recoverSupervisorUnit().finally(() => { this.recovery = null; });
    return this.recovery;
  }

  private async recoverSupervisorUnit(): Promise<boolean> {
    await this.ready();
    if (!this.socketPath) return false;
    // Nur die Produktionsverdrahtung darf die echte User-Unit steuern. Tests,
    // Entwicklung und fremde Socket-Besitzer bleiben auf ihrem privaten Server.
    // Ein injizierter systemd-Runner bildet die Recovery kontrolliert nach.
    if (supportsSystemd() && !this.manageSystemdUnit && !this.systemdRunner) return false;
    if (process.env.NODE_ENV === "test" && !this.systemdRunner) return false;
    // Nur ein nachweislich fehlender Server rechtfertigt einen Neustart. Ein
    // Timeout oder Lesefehler darf keine laufenden Terminals beenden.
    const probe = await this.command(["list-sessions"], 3_000);
    if (probe.status === 0) return true;
    if (!missingServer(probe)) return false;
    if (!supportsSystemd()) return this.startDetachedSupervisor();
    try {
      ensurePrivateSocketDirectory(this.socketPath);
      // RemainAfterExit lässt systemctl start bei active(exited) wirkungslos bleiben.
      // Jede aktive Unit ohne erreichbaren tmux-Server wird deshalb neu gestartet.
      const state = await this.systemctl(["--user", "show", "--property=ActiveState", "--property=SubState", TERMINAL_SUPERVISOR_UNIT], 5_000)
        .catch(() => null);
      const action = state?.status === 0 && /(?:^|\n)ActiveState=active(?:\r?\n|$)/.test(state.stdout) ? "restart" : "start";
      const started = await this.systemctl(["--user", action, TERMINAL_SUPERVISOR_UNIT]);
      if (started.status !== 0) return false;
    } catch { return false; }
    return this.waitForSupervisor();
  }

  private async startDetachedSupervisor(): Promise<boolean> {
    this.spawnFailed = false;
    try {
      ensurePrivateSocketDirectory(this.socketPath!);
      const environment = { ...process.env };
      delete environment.TMUX;
      const child = spawn(this.executable, terminalSupervisorStartArgs(this.socketPath!), {
        detached: true,
        stdio: "ignore",
        env: environment,
      });
      child.once("error", () => { this.spawnFailed = true; });
      child.unref();
    } catch { return false; }
    return await this.waitForSupervisor() && !this.spawnFailed;
  }

  private async waitForSupervisor(): Promise<boolean> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await this.isRunning()) return true;
      await delay(250, undefined, { signal: this.abort.signal });
    }
    return this.isRunning();
  }

  /** Prüft, ob am Socket bereits ein tmux-Server antwortet. */
  async isRunning(): Promise<boolean> { return (await this.command(["list-sessions"], 3_000)).status === 0; }

  sessionName(runtimeId: string) { return `wrapt-${runtimeId.replaceAll("-", "")}`; }

  async has(name: string) { return (await this.command(["has-session", "-t", name], 3_000)).status === 0; }

  async ensure(input: EnsureSupervisorInput): Promise<string> {
    return (await this.ensureWithStatus(input)).name;
  }

  async ensureWithStatus(input: EnsureSupervisorInput): Promise<{ name: string; created: boolean }> {
    // Gespeicherte und importierte Sitzungen behalten ihren Namen, auch
    // im älteren workbench-Namespace. Sonst entstünde eine zweite Shell.
    const name = input.supervisorName ?? this.sessionName(input.runtimeId);
    return this.mutate(name, async () => {
      await this.ready();
      const scan = await this.scanForMutation();
      const existing = scan.sessions.find((session) => session.name === name);
      const created = !existing;
      if (!existing) await this.createSession(name, input.cwd, input.command);
      else if (existing.dead) await this.respawnPane(name, input.cwd, input.command);
      await this.applySessionOptions(name, input);
      return { name, created };
    });
  }

  /**
   * Ein Scan vor einer Mutation darf keinen tmux-Server aus dem Backend-
   * Prozess heraus starten. Ist der Server nicht erreichbar, wird zuerst die
   * dedizierte User-Unit versucht und danach erneut gelesen. Bleibt er weg,
   * bricht der Aufruf klar ab, statt eine Pane in der falschen Cgroup anzulegen.
   */
  private async scanForMutation(): Promise<{ available: boolean; sessions: SupervisorSession[] }> {
    const scan = await this.scan();
    if (scan.available) return scan;
    await this.ensureSupervisorUnit();
    const recovered = await this.scan();
    if (!recovered.available) throw new Error("Der Terminal-Supervisor ist nicht erreichbar.");
    return recovered;
  }

  private commandLine(command: SupervisedCommand): string {
    const environment = Object.entries(command.environment).map(([key, value]) => `${key}=${value}`);
    return ["/usr/bin/env", ...environment, command.file, ...command.args].map(shellQuote).join(" ");
  }

  private async createSession(name: string, cwd: string, command: SupervisedCommand): Promise<void> {
    const created = await this.command(["new-session", "-d", "-s", name, "-c", cwd, this.commandLine(command)], 5_000);
    if (created.status !== 0) throw new Error(created.stderr.trim() || "tmux-Session konnte nicht gestartet werden.");
  }

  private async applySessionOptions(name: string, input: SupervisorMetadata) {
    // Ein tmux-Aufruf übernimmt alle Optionen und Metadaten. Neun synchrone
    // Unterprozesse pro Attach blockierten zuvor den Server.
    const options = [
      ["history-limit", "100000"], ["remain-on-exit", "on"],
      ["alternate-screen", "off"], ["status", "off"],
      ["message-style", "fg=default,bg=default"], ["mouse", "off"],
      ["@wrapt_runtime_id", input.runtimeId], ["@wrapt_kind", input.kind],
      ["@wrapt_project_id", input.projectId ?? ""],
    ];
    await this.run(options.flatMap(([key, value], index) => [...(index ? [";"] : []), "set-option", "-t", name, key!, value!]));
  }

  attachCommand(name: string) { return { file: this.executable, args: this.socketArgs(["attach-session", "-t", name]) }; }

  async respawn(name: string, cwd: string, command: SupervisedCommand): Promise<void> {
    await this.respawnSession(name, cwd, command);
  }

  async respawnWithStatus(name: string, cwd: string, command: SupervisedCommand, metadata: SupervisorMetadata): Promise<{ name: string; created: boolean }> {
    return this.respawnSession(name, cwd, command, metadata);
  }

  private respawnSession(name: string, cwd: string, command: SupervisedCommand, metadata?: SupervisorMetadata): Promise<{ name: string; created: boolean }> {
    return this.mutate(name, async () => {
      await this.ready();
      const scan = await this.scanForMutation();
      const existing = scan.sessions.find((session) => session.name === name);
      const created = !existing;
      const sessionMetadata = metadata ?? { runtimeId: name, kind: "shell" as const, projectId: null };
      if (!existing) await this.createSession(name, cwd, command);
      else await this.respawnPane(name, cwd, command);
      if (metadata || created) await this.applySessionOptions(name, sessionMetadata);
      return { name, created };
    });
  }

  private async respawnPane(name: string, cwd: string, command: SupervisedCommand): Promise<void> {
    await this.run(["respawn-pane", "-k", "-t", name, "-c", cwd, this.commandLine(command)]);
  }

  async sendLastCommandHint(name: string) {
    await this.run(["send-keys", "-t", name, "Up"]);
  }

  /** True, wenn die Pane gerade den Alternate Screen (Fullscreen-TUI) nutzt. */
  async isAlternate(name: string): Promise<boolean> {
    const result = await this.command(["display-message", "-p", "-t", name, "#{alternate_on}"], 3_000);
    return result.status === 0 && result.stdout.trim() === "1";
  }

  /**
   * Liefert den gerenderten Pane-Inhalt für Reconnect-Snapshots. Im Alternate
   * Screen wird nur die sichtbare Fläche ohne `-J` erfasst, damit Boxen und
   * Tabellen beim Wiedergeben nicht zerstört werden. Der normale Puffer behält
   * `-J` und den Scrollback für korrekt umbrochene lange Zeilen.
   */
  async capture(name: string) {
    const args = await this.isAlternate(name)
      ? ["capture-pane", "-p", "-e", "-t", name]
      : ["capture-pane", "-p", "-e", "-J", "-S", "-10000", "-t", name];
    const result = await this.command(args);
    return result.status === 0 ? result.stdout : "";
  }

  async currentPath(name: string) {
    const result = await this.command(["display-message", "-p", "-t", name, "#{pane_current_path}"], 3_000);
    return result.status === 0 ? result.stdout.trim() : null;
  }

  async terminate(name: string) {
    await this.mutate(name, async () => { if (await this.has(name)) await this.run(["kill-session", "-t", name]); });
  }

  /** Scanfehler werden weitergegeben; nur ein fehlender Server ist verfügbar=false. */
  async scan(): Promise<{ available: boolean; sessions: SupervisorSession[] }> {
    const format = [
      "#{session_name}", "#{session_created}", "#{pane_current_path}", "#{pane_current_command}", "#{pane_start_command}",
      "#{@wrapt_runtime_id}", "#{@workbench_runtime_id}", "#{@wrapt_kind}", "#{@workbench_kind}",
      "#{@wrapt_project_id}", "#{@workbench_project_id}", "#{pane_dead}", "#{pane_dead_status}", "#{pane_dead_signal}",
    ].join("\t");
    const result = await this.command(["list-panes", "-a", "-F", format]);
    if (result.status !== 0) {
      if (missingServer(result)) return { available: false, sessions: [] };
      throw new Error(result.stderr.trim() || "tmux-Sessions konnten nicht gelesen werden.");
    }
    const seen = new Set<string>();
    const sessions = result.stdout.split("\n").flatMap((line): SupervisorSession[] => {
      const [name, created, cwd, command, startCommand, runtimeId, legacyRuntimeId, rawKind, legacyKind, projectId, legacyProjectId, rawDead, rawExitCode, rawExitSignal] = line.split("\t");
      if (!name || seen.has(name)) return [];
      seen.add(name);
      const resolvedRuntimeId = runtimeId || legacyRuntimeId || null;
      const resolvedKind = rawKind || legacyKind;
      const commandLine = `${command ?? ""} ${startCommand ?? ""}`;
      const kind: TerminalKind = resolvedKind === "codex" || resolvedKind === "opencode" || resolvedKind === "claude" ? resolvedKind : commandLine.includes("opencode") ? "opencode" : commandLine.includes("codex") ? "codex" : commandLine.includes("claude") ? "claude" : "shell";
      const dead = rawDead === "1";
      const parsedExitCode = dead && rawExitCode ? Number(rawExitCode) : NaN;
      const parsedExitSignal = dead && rawExitSignal ? Number(rawExitSignal) : NaN;
      return [{
        name, runtimeId: resolvedRuntimeId, kind, projectId: projectId || legacyProjectId || null,
        cwd: cwd || "/", command: startCommand || command || "shell", createdAt: Number(created || 0) * 1_000,
        managed: (name.startsWith("wrapt-") || name.startsWith("workbench-")) && Boolean(resolvedRuntimeId),
        dead, exitCode: Number.isFinite(parsedExitCode) ? parsedExitCode : null,
        exitSignal: Number.isFinite(parsedExitSignal) ? parsedExitSignal : null,
      }];
    });
    return { available: true, sessions };
  }

  /** Kompatibilitätswrapper: Eine leere Liste bleibt bei fehlendem Server erlaubt. */
  async list(): Promise<SupervisorSession[]> {
    try { return (await this.scan()).sessions; } catch { return []; }
  }

  async paneStatus(name: string): Promise<PaneStatus> {
    try {
      const scan = await this.scan();
      if (!scan.available) return { state: "unknown", exitCode: null };
      const pane = scan.sessions.find((session) => session.name === name);
      if (!pane) return { state: "missing", exitCode: null };
      if (!pane.dead) return { state: "alive", exitCode: null };
      // Ein Signal ist nur bei einem signalbeendeten Prozess aussagekräftig.
      return { state: "dead", exitCode: pane.exitCode, ...(pane.exitSignal ? { exitSignal: pane.exitSignal } : {}) };
    } catch { return { state: "unknown", exitCode: null }; }
  }

  ready(): Promise<void> {
    if (!this.availability) {
      const attempt = this.command(["-V"], 3_000).then((result) => {
        if (result.status !== 0) throw new Error("tmux ist nicht verfügbar.");
      });
      this.availability = attempt;
      // Ein transienter Timeout darf spätere, lazy Startversuche nicht
      // dauerhaft mit einer abgelehnten Bereitschaft vergiften.
      void attempt.catch(() => { if (this.availability === attempt) this.availability = null; });
    }
    return this.availability;
  }

  /** Ein synchron werfender Testrunner wird ebenfalls zu einer Ablehnung. */
  private toPromise(run: () => TmuxCommandResult | Promise<TmuxCommandResult>): Promise<TmuxCommandResult> {
    try { return Promise.resolve(run()); } catch (error) { return Promise.reject(error); }
  }

  private command(args: string[], timeout = 4_000): Promise<TmuxCommandResult> {
    const runner = this.runner;
    const operation = runner
      ? this.toPromise(() => runner(this.socketArgs(args), timeout, this.abort.signal))
      : execa(this.executable, this.socketArgs(args), { reject: false, timeout, cancelSignal: this.abort.signal })
        .then((result) => ({ status: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr }));
    return this.track(operation);
  }

  private systemctl(args: string[], timeout = 15_000): Promise<TmuxCommandResult> {
    const runner = this.systemdRunner;
    const operation = runner
      ? this.toPromise(() => runner(args, timeout, this.abort.signal))
      : execa("systemctl", args, { reject: false, timeout, cancelSignal: this.abort.signal })
        .then((result) => ({ status: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr }));
    return this.track(operation);
  }

  private track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation);
    void operation.finally(() => this.pending.delete(operation)).catch(() => {});
    return operation;
  }

  private mutate<T>(name: string, action: () => Promise<T>): Promise<T> {
    const previous = this.mutations.get(name) ?? Promise.resolve();
    const operation = previous.catch(() => {}).then(action);
    this.mutations.set(name, operation);
    void operation.finally(() => { if (this.mutations.get(name) === operation) this.mutations.delete(name); }).catch(() => {});
    return operation;
  }

  private async run(args: string[]) {
    const result = await this.command(args);
    if (result.status !== 0) throw new Error(result.stderr.trim() || `tmux ${args[0] ?? "command"} fehlgeschlagen.`);
  }

  async close(): Promise<void> {
    this.abort.abort();
    await Promise.allSettled([...this.pending, ...this.mutations.values()]);
  }
}

export interface TmuxCommandResult { status: number | null; stdout: string; stderr: string }
