import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { execa } from "execa";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { supportsSystemd } from "../system/platform.js";
import type { TerminalKind } from "./protocol.js";

export interface SupervisedCommand {
  file: string;
  args: string[];
  environment: Record<string, string>;
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
}

function shellQuote(value: string) { return `'${value.replaceAll("'", `'\\''`)}'`; }

/** Socket im privaten Runtime-Verzeichnis oder ersatzweise im Datenverzeichnis. */
export function defaultTerminalSocketPath(
  dataDirectory: string,
  runtimeDirectory = process.env.XDG_RUNTIME_DIR,
  platform: NodeJS.Platform = process.platform,
): string {
  if (runtimeDirectory?.trim()) return join(runtimeDirectory, "wrapt", "tmux.sock");
  if (runtimeDirectory !== undefined && supportsSystemd(platform)) return `${runtimeDirectory}/wrapt/tmux.sock`;
  if (supportsSystemd(platform)) {
    return `/run/user/${process.getuid?.() ?? process.env.UID ?? "1000"}/wrapt/tmux.sock`;
  }
  return join(dataDirectory, "run", "tmux.sock");
}

export const TERMINAL_SUPERVISOR_UNIT = "wrapt-terminal-supervisor.service";
export const TERMINAL_SUPERVISOR_SESSION = "wrapt-supervisor";

export function terminalSupervisorStartArgs(socketPath: string): string[] {
  return ["-S", socketPath, "new-session", "-d", "-s", TERMINAL_SUPERVISOR_SESSION];
}

function ensurePrivateSocketDirectory(socketPath: string): void {
  const directory = dirname(socketPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

export class TmuxSupervisor {
  readonly kind = "tmux" as const;
  private spawnFailed = false;
  private availability: Promise<void> | null = null;
  private readonly abort = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly mutations = new Map<string, Promise<unknown>>();

  constructor(readonly executable: string, readonly socketPath: string | null = null,
    private readonly runner?: (args: string[], timeout: number, signal: AbortSignal) => Promise<TmuxCommandResult> | TmuxCommandResult) {
    if (socketPath) {
      try {
        if (supportsSystemd()) mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
        else ensurePrivateSocketDirectory(socketPath);
      } catch { /* Der Server versucht es später erneut. */ }
    }
  }

  /** Ergänzt den dedizierten Socket vor allen tmux-Argumenten. */
  private socketArgs(args: string[]): string[] {
    return this.socketPath ? ["-S", this.socketPath, ...args] : args;
  }

  /** Linux nutzt die User-Unit, macOS startet denselben tmux-Server detached. */
  async ensureSupervisorUnit(): Promise<boolean> {
    await this.ready();
    if (!this.socketPath) return false;
    if (await this.isRunning()) return true;
    if (!supportsSystemd()) return this.startDetachedSupervisor();
    try {
      const start = await execa("systemctl", ["--user", "start", TERMINAL_SUPERVISOR_UNIT], { reject: false, timeout: 15_000, cancelSignal: this.abort.signal });
      if (start.exitCode !== 0) return false;
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
    // Kurz warten, bis der Server den Socket annimmt.
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

  async ensure(input: { runtimeId: string; supervisorName?: string | null; kind: TerminalKind; projectId: string | null; cwd: string; command: SupervisedCommand }) {
    // Gespeicherte und importierte Sitzungen behalten ihren Namen, auch
    // im älteren workbench-Namespace. Sonst entstünde eine zweite Shell.
    const name = input.supervisorName ?? this.sessionName(input.runtimeId);
    return this.mutate(name, async () => {
    await this.ready();
    if (!await this.has(name)) {
      const environment = Object.entries(input.command.environment).map(([key, value]) => `${key}=${value}`);
      const command = ["/usr/bin/env", ...environment, input.command.file, ...input.command.args].map(shellQuote).join(" ");
      const created = await this.command(["new-session", "-d", "-s", name, "-c", input.cwd, command], 5_000);
      if (created.status !== 0) throw new Error(created.stderr.trim() || "tmux-Session konnte nicht gestartet werden.");
    }
    // Optionen gelten für neue und bestehende Sessions: So übernimmt eine
    // laufende Session nach einem Server-Neustart automatisch die aktuelle
    // Konfiguration (unsichtbare Statusleiste, normaler Puffer, Maus).
    await this.applySessionOptions(name, input);
    return name;
    });
  }

  private async applySessionOptions(name: string, input: { runtimeId: string; kind: TerminalKind; projectId: string | null }) {
    // tmux bleibt im normalen Puffer statt in den Alternate Screen zu wechseln.
    // Sonst hätte xterm keinen Scrollback und das Mausrad würde zu Pfeiltasten
    // an die Shell — Scrollen wäre nur über tmux-Mausmodi möglich.
    // tmux bleibt als Supervisor aktiv, darf für den Nutzer aber unsichtbar
    // sein: keine Statusleiste und keine störenden Meldungsfarben.
    // Maus bleibt aus: Mit `mouse on` verwandelt tmux jede ankommende
    // Wheel-Sequenz in den Copy-Mode (gelbe Positionsanzeige, Auswahl) und
    // schluckt damit das normale Scrollback. Für Apps mit Maus-Reporting
    // (z. B. OpenCode) ist das Flag nicht nötig: Fordert die Anwendung den
    // Mausmodus an, reicht tmux die Sequenzen auch mit `mouse off` durch.
    // Ein tmux-Aufruf übernimmt sämtliche Optionen und Metadaten. Neun
    // synchrone Unterprozesse pro Attach blockierten zuvor den Server.
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

  async respawn(name: string, cwd: string, command: SupervisedCommand) {
    const environment = Object.entries(command.environment).map(([key, value]) => `${key}=${value}`);
    const cmd = ["/usr/bin/env", ...environment, command.file, ...command.args].map(shellQuote).join(" ");
    await this.mutate(name, () => this.run(["respawn-pane", "-k", "-t", name, "-c", cwd, cmd]));
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
   * Screen (Fullscreen-TUI) wird nur die sichtbare Fläche ohne `-J` erfasst:
   * `-J` fügt umgebrochene Pane-Zeilen zusammen und zerstört damit Boxen,
   * Tabellen und Sidebars, sobald der Dump in xterm neu umbrochen wird. Der
   * normale Puffer behält `-J` und den Scrollback, damit lange Zeilen beim
   * Wiedergeben korrekt im aktuellen Raster umfließen.
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

  async list(): Promise<SupervisorSession[]> {
    // Neue Sessions verwenden den Wrapt-Namespace. Die beiden alten Metadaten
    // werden beim Einlesen bewusst noch akzeptiert, damit ein laufender
    // Legacy-tmux-Server beim Dienst-Cutover nicht seine Runtime-IDs verliert.
    const format = [
      "#{session_name}", "#{session_created}", "#{pane_current_path}", "#{pane_current_command}", "#{pane_start_command}",
      "#{@wrapt_runtime_id}", "#{@workbench_runtime_id}",
      "#{@wrapt_kind}", "#{@workbench_kind}",
      "#{@wrapt_project_id}", "#{@workbench_project_id}",
    ].join("\t");
    const result = await this.command(["list-panes", "-a", "-F", format]);
    if (result.status !== 0) return [];
    const seen = new Set<string>();
    return result.stdout.split("\n").flatMap((line) => {
      const [name, created, cwd, command, startCommand, runtimeId, legacyRuntimeId, rawKind, legacyKind, projectId, legacyProjectId] = line.split("\t");
      if (!name || seen.has(name)) return [];
      seen.add(name);
      const resolvedRuntimeId = runtimeId || legacyRuntimeId || null;
      const resolvedKind = rawKind || legacyKind;
      const commandLine = `${command ?? ""} ${startCommand ?? ""}`;
      const kind: TerminalKind = resolvedKind === "codex" || resolvedKind === "opencode" || resolvedKind === "claude" ? resolvedKind : commandLine.includes("opencode") ? "opencode" : commandLine.includes("codex") ? "codex" : commandLine.includes("claude") ? "claude" : "shell";
      const resolvedProjectId = projectId || legacyProjectId || null;
      return [{ name, runtimeId: resolvedRuntimeId, kind, projectId: resolvedProjectId, cwd: cwd || "/", command: startCommand || command || "shell", createdAt: Number(created || 0) * 1_000, managed: (name.startsWith("wrapt-") || name.startsWith("workbench-")) && Boolean(resolvedRuntimeId) }];
    });
  }

  ready(): Promise<void> {
    this.availability ??= this.command(["-V"], 3_000).then((result) => {
      if (result.status !== 0) throw new Error("tmux ist nicht verfügbar.");
    });
    return this.availability;
  }

  private command(args: string[], timeout = 4_000): Promise<TmuxCommandResult> {
    const operation = this.runner ? Promise.resolve(this.runner(this.socketArgs(args), timeout, this.abort.signal))
      : execa(this.executable, this.socketArgs(args), { reject: false, timeout, cancelSignal: this.abort.signal })
        .then((result) => ({ status: result.exitCode ?? 1, stdout: result.stdout, stderr: result.stderr }));
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
