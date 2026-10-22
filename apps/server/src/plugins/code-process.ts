import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pluginRuntimeDescriptionSchema, type PluginRuntimeDescription, type PluginWireMessage } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { PluginRpcPeer } from "./code-rpc.js";
import type { PluginWorkerBoot } from "./code-worker-context.js";

export interface PluginProcessOptions {
  timeoutMs: number;
  shutdownTimeoutMs: number;
  handle(method: string, input: unknown): Promise<unknown> | unknown;
  log?(level: "info" | "error", message: string): void;
  onExit?(code: number | null, signal: NodeJS.Signals | null): void;
}

/** Eigener Prozess und Prozessgruppe für kontrollierbares Plugin-Cleanup. Keine Sandbox. */
export class PluginProcess {
  readonly peer: PluginRpcPeer;
  readonly child: ChildProcess;
  description: PluginRuntimeDescription | undefined;
  private readonly exited: Promise<void>;
  private stopping = false;

  get available(): boolean { return !this.stopping && this.child.connected && this.child.exitCode === null && this.child.signalCode === null; }

  constructor(private readonly boot: PluginWorkerBoot, private readonly options: PluginProcessOptions) {
    const compiledWorker = fileURLToPath(new URL("./code-worker.js", import.meta.url));
    const worker = existsSync(compiledWorker) ? compiledWorker : fileURLToPath(new URL("./code-worker.ts", import.meta.url));
    const require = createRequire(import.meta.url);
    this.child = fork(worker, [], {
      cwd: boot.releaseDirectory,
      detached: process.platform !== "win32",
      execArgv: worker.endsWith(".ts") ? ["--import", pathToFileURL(require.resolve("tsx/esm")).href] : [],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      serialization: "advanced",
    });
    this.peer = new PluginRpcPeer((message: PluginWireMessage) => {
      if (!this.child.connected) throw new AppError(503, "runtime-unavailable", "Der Plugin-Prozess wurde beendet.");
      this.child.send(message, (error) => { if (error) this.peer.close("Die Verbindung zum Plugin-Prozess ist abgebrochen."); });
    }, options.handle, options.timeoutMs);
    this.child.on("message", (message) => this.peer.receive(message));
    this.child.on("error", () => this.peer.close("Der Plugin-Prozess konnte nicht gestartet werden."));
    this.child.stdout?.on("data", (value: Buffer) => options.log?.("info", value.toString("utf8").slice(0, 4000)));
    this.child.stderr?.on("data", (value: Buffer) => options.log?.("error", value.toString("utf8").slice(0, 4000)));
    this.exited = new Promise((resolve) => {
      this.child.once("exit", (code, signal) => {
        this.peer.close();
        if (!this.stopping) options.onExit?.(code, signal);
        resolve();
      });
    });
  }

  async start(): Promise<PluginRuntimeDescription> {
    try {
      const description = pluginRuntimeDescriptionSchema.parse(await this.peer.call("boot", { ...this.boot, requestTimeoutMs: this.options.timeoutMs }));
      if (description.id !== this.boot.id || description.version !== this.boot.version) throw new AppError(409, "health-check-failed", "Die Plugin-Laufzeit meldet eine abweichende Identität.");
      this.description = description;
      return description;
    } catch (error) { await this.stop(true); throw error; }
  }

  async call<T = unknown>(method: string, input?: unknown, timeoutMs = this.options.timeoutMs): Promise<T> {
    try { return await this.peer.call<T>(method, input, timeoutMs); }
    catch (error) {
      if (error instanceof AppError && error.code === "runtime-timeout") {
        await this.stop(true);
        this.options.onExit?.(this.child.exitCode, this.child.signalCode);
      }
      throw error;
    }
  }

  async stop(force = false): Promise<void> {
    if (this.stopping) { await this.exited; return; }
    this.stopping = true;
    if (!force && this.child.connected) {
      try { await this.peer.call("dispose", undefined, this.options.shutdownTimeoutMs); }
      catch { /* Fehlerhaftes Cleanup darf das Beenden nicht verhindern. */ }
    }
    this.kill("SIGTERM");
    const forceKill = setTimeout(() => this.kill("SIGKILL"), this.options.shutdownTimeoutMs);
    forceKill.unref();
    try { await this.exited; }
    finally { clearTimeout(forceKill); this.peer.close(); }
  }

  private kill(signal: NodeJS.Signals): void {
    if (!this.child.pid) return;
    try {
      if (process.platform === "win32") this.child.kill(signal);
      else process.kill(-this.child.pid, signal);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) throw error;
    }
  }
}
