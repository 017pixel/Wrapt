import { execa } from "execa";
import { join } from "node:path";
import type { Project, PreviewRuntimeService } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import type { PaneState } from "./runtimeStatus.js";
import type { PreviewDevServerManagerOptions } from "./runtimeManagerOptions.js";

export interface CommandResult { status: number | null; stdout: string; stderr: string }
export type CommandRunner = (args: string[], timeoutMilliseconds: number, signal?: AbortSignal) => CommandResult | Promise<CommandResult>;
export const RUNTIME_PORTS_OPTION = "@wrapt_runtime_ports";

export interface RuntimeSessionSnapshot {
  name: string;
  userId: string;
  projectId: string;
  publicationRequested: boolean;
  ports: string | null;
  panes: PaneState[];
}

export function cleanOutput(value: string): string {
  // eslint-disable-next-line no-control-regex
  const operatingSystemCommand = new RegExp("\\u001b\\][^\\u0007]*(?:\\u0007|\\u001b\\\\)", "g");
  // eslint-disable-next-line no-control-regex
  const ansiSequence = new RegExp("\\u001b\\[[0-?]*[ -/]*[@-~]", "g");
  // eslint-disable-next-line no-control-regex
  const unsupportedControl = new RegExp("[^\\u0009\\u000a\\u000d\\u0020-\\u007e\\u00a0-\\uffff]", "g");
  return value.replace(operatingSystemCommand, "").replace(ansiSequence, "").replace(unsupportedControl, "");
}

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'\\''`)}'`; }

export function sanitizeDevServerPath(projectPath: string, ambientPath: string): string {
  const ownBin = join(projectPath, "node_modules", ".bin");
  const kept = ambientPath.split(":").filter((entry) => {
    const normalized = entry.replace(/\/+$/, "");
    if (normalized === "" || normalized === ownBin) return false;
    if (normalized.endsWith("/node_modules/.bin")) return false;
    if (normalized.includes("/.pnpm/")) return false;
    if (normalized.endsWith("/node-gyp-bin")) return false;
    return true;
  });
  return [ownBin, ...kept].join(":");
}

export class PreviewRuntimeSupervisor {
  private readonly abort = new AbortController();
  private readonly pending = new Set<Promise<CommandResult>>();
  private readonly tmuxSocket: string;
  constructor(private readonly options: PreviewDevServerManagerOptions) {
    this.tmuxSocket = options.tmuxSocket ?? "wrapt-previews";
  }

  run(args: string[], timeoutMilliseconds: number): Promise<CommandResult> {
    const loading = (async () => {
      this.abort.signal.throwIfAborted();
      if (this.options.runner) return this.options.runner(args, timeoutMilliseconds, this.abort.signal);
      const result = await execa(this.options.tmuxExecutable, ["-L", this.tmuxSocket, ...args], {
        timeout: timeoutMilliseconds, reject: false, cancelSignal: this.abort.signal,
      });
      return { status: result.exitCode ?? null, stdout: result.stdout, stderr: result.stderr };
    })();
    this.pending.add(loading);
    void loading.finally(() => this.pending.delete(loading)).catch(() => {});
    return loading;
  }

  async close(): Promise<void> {
    this.abort.abort();
    await Promise.allSettled([...this.pending]);
  }

  async assignedSessionPorts(excludedSessionName: string): Promise<Map<number, string>> {
    const assigned = new Map<number, string>();
    for (const session of await this.snapshot()) {
      if (session.name === excludedSessionName || !session.panes.some((pane) => !pane.dead)) continue;
      const raw = session.ports;
      if (!raw) continue;
      try {
        const ports = Object.values(JSON.parse(raw) as Record<string, unknown>);
        for (const port of ports) if (typeof port === "number" && this.options.allowedProjectPorts.includes(port)) assigned.set(port, "einer anderen Projektlaufzeit");
      } catch { /* Ungültige Alt-Sitzungen werden weiterhin über die lokale Portübersicht erkannt. */ }
    }
    return assigned;
  }

  /** Eine Sammelabfrage liefert Metadaten und alle Fenster für den Watchdog. */
  async snapshot(): Promise<RuntimeSessionSnapshot[]> {
    const format = ["#{session_name}", "#{@wrapt_user_id}", "#{@wrapt_project_id}",
      "#{@wrapt_preview_publication_requested}", "#{@wrapt_runtime_ports}", "#{window_name}",
      "#{pane_dead}", "#{pane_dead_status}", "#{pane_pid}", "#{session_created}"].join("\t");
    const result = await this.run(["list-panes", "-a", "-F", format], 4_000);
    if (result.status !== 0) return [];
    const sessions = new Map<string, RuntimeSessionSnapshot>();
    for (const line of result.stdout.split("\n")) {
      const [name, userId, projectId, requested, ports, serviceId, dead, exitCode, pid, created] = line.split("\t");
      if (!name?.startsWith("wrapt-preview-")) continue;
      const session = sessions.get(name) ?? {
        name, userId: userId ?? "", projectId: projectId ?? "", publicationRequested: requested === "1", ports: ports || null, panes: [],
      };
      session.panes.push({
        serviceId: serviceId ?? "dev", dead: dead === "1",
        exitCode: dead === "1" && exitCode ? Number(exitCode) : null,
        pid: Number(pid) > 0 ? Number(pid) : null,
        startedAt: Number(created) > 0 ? new Date(Number(created) * 1_000).toISOString() : null,
      });
      sessions.set(name, session);
    }
    return [...sessions.values()];
  }

  serviceCommand(project: Project, service: PreviewRuntimeService): string {
    const path = sanitizeDevServerPath(project.path, process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
    const hadPlaceholder = service.command.includes("{port}");
    let command = service.port === null ? service.command : service.command.replaceAll("{port}", String(service.port));
    if (service.port !== null && service.portMode === "argument" && !hadPlaceholder) {
      command += service.source === "detected" ? ` -- --port ${service.port}` : ` --port ${service.port}`;
    }
    const environment = ["/usr/bin/env", `PATH=${path}`, "FORCE_COLOR=0"];
    if (service.port !== null && service.portMode === "environment") environment.push(`PORT=${service.port}`, "HOST=127.0.0.1");
    environment.push("/bin/bash", "-lc", command);
    return environment.map(shellQuote).join(" ");
  }

  async runSetup(project: Project, runtimeName: string, command: string): Promise<void> {
    const setupName = `${runtimeName}-setup`;
    const signal = `${setupName}-done`;
    const path = sanitizeDevServerPath(project.path, process.env.PATH ?? "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
    const setup = [`/usr/bin/env`, `PATH=${path}`, "/bin/bash", "-lc", `${command} && ${shellQuote(this.options.tmuxExecutable)} -L ${shellQuote(this.tmuxSocket)} wait-for -S ${shellQuote(signal)}`].map(shellQuote).join(" ");
    const created = await this.run(["new-session", "-d", "-s", setupName, "-c", project.path, setup], this.options.startTimeoutMilliseconds);
    if (created.status !== 0) throw new AppError(500, "PREVIEW_RUNTIME_SETUP_FAILED", cleanOutput(created.stderr).trim() || "Die Vorbereitung der Projektlaufzeit ist fehlgeschlagen.");
    try {
      const waited = await this.run(["wait-for", signal], this.options.startTimeoutMilliseconds);
      const output = await this.run(["capture-pane", "-p", "-J", "-S", "-10000", "-t", `${setupName}:0.0`], 4_000);
      if (waited.status !== 0) throw new AppError(500, "PREVIEW_RUNTIME_SETUP_FAILED", cleanOutput(output.stdout || waited.stderr).trim() || "Die Vorbereitung der Projektlaufzeit ist fehlgeschlagen.");
    } finally {
      // Nur die eigene kurzlebige Setup-Sitzung aufräumen, auch nach Abort.
      const args = ["kill-session", "-t", setupName];
      if (this.options.runner) await this.options.runner(args, 5_000);
      else await execa(this.options.tmuxExecutable, ["-L", this.tmuxSocket, ...args], { timeout: 5_000, reject: false });
    }
  }

  async panes(name: string): Promise<PaneState[]> {
    // `-s`: alle Fenster der Sitzung; sonst nur das aktuelle (Dienste fehlen).
    const result = await this.run(["list-panes", "-s", "-t", name, "-F", "#{window_name}\t#{pane_dead}\t#{pane_dead_status}\t#{pane_pid}\t#{session_created}"], 4_000);
    if (result.status !== 0) return [];
    return result.stdout.trim().split("\n").filter(Boolean).map((line) => {
      const [serviceId, dead, exitCode, pid, created] = line.split("\t");
      const createdAt = Number(created);
      return {
        serviceId: serviceId ?? "dev", dead: dead === "1",
        exitCode: dead === "1" && exitCode !== "" ? Number(exitCode) : null,
        pid: Number(pid) > 0 ? Number(pid) : null,
        startedAt: createdAt > 0 ? new Date(createdAt * 1_000).toISOString() : null,
      };
    });
  }

  async execute(args: string[]): Promise<void> {
    const result = await this.run(args, 5_000);
    if (result.status !== 0) throw new AppError(500, "DEV_SERVER_SUPERVISOR_FAILED", cleanOutput(result.stderr).trim() || "Die Projektlaufzeit-Steuerung ist fehlgeschlagen.");
  }

  /** Startet die Preview außerhalb der Backend-Cgroup, damit sie Neustarts überlebt. */
  async createSessionOutsideWorkbench(args: string[], timeoutMilliseconds: number): Promise<CommandResult> {
    if (this.options.runner || this.options.useSystemdSupervisor === false || process.platform !== "linux") return this.run(args, timeoutMilliseconds);
    const unit = `wrapt-preview-start-${process.pid}-${Date.now()}`;
    const result = await execa("/usr/bin/systemd-run", [
      "--user",
      "--scope",
      "--collect",
      "--quiet",
      `--unit=${unit}`,
      this.options.tmuxExecutable,
      "-L",
      this.tmuxSocket,
      ...args,
    ], { timeout: timeoutMilliseconds, reject: false, cancelSignal: this.abort.signal });
    return { status: result.exitCode ?? null, stdout: result.stdout, stderr: result.stderr };
  }

  async sessionOption(name: string, option: string): Promise<string | null> {
    const result = await this.run(["show-options", "-t", name, "-v", option], 4_000);
    if (result.status !== 0) return null;
    return result.stdout.trim() || null;
  }
}
