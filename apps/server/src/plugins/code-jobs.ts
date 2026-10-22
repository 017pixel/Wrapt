import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { PluginWireRequest } from "@wrapt/extension-contracts";
import { AppError } from "../utils/errors.js";
import { redactText } from "../utils/redaction.js";
import type { ActiveCodePlugin } from "./code-runtime-host.js";

interface JobTimer { runtimeId: string; timer: NodeJS.Timeout | undefined }
interface JobHistoryRow { id: string; plugin_id: string; name: string; status: string; started_at: string; finished_at: string | null; error: string | null }

export class PluginJobScheduler {
  private readonly database: DatabaseSync;
  private readonly timers = new Map<string, JobTimer>();
  private readonly running = new Map<string, Promise<unknown>>();
  private closed = false;

  constructor(path: string, private readonly runtimes: () => readonly ActiveCodePlugin[], private readonly defaultTimeoutMs: number) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    this.database.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS plugin_job_runs (id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, name TEXT NOT NULL, status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, error TEXT);
      CREATE INDEX IF NOT EXISTS plugin_job_history ON plugin_job_runs(plugin_id, started_at);
      UPDATE plugin_job_runs SET status = 'interrupted', finished_at = datetime('now') WHERE status = 'running';`);
  }

  sync(): void {
    if (this.closed) return;
    const present = new Set<string>();
    for (const runtime of this.runtimes()) {
      for (const job of runtime.description.jobs) {
        const key = `${runtime.slot.extensionId}:${job.name}`;
        present.add(key);
        const current = this.timers.get(key);
        if (current?.runtimeId === runtime.pointer.runtimeId) continue;
        if (current?.timer) clearInterval(current.timer);
        const invoke = () => { void this.run(runtime.slot.extensionId, job.name).catch(() => undefined); };
        const timer = job.options.everyMs ? setInterval(invoke, job.options.everyMs) : undefined;
        timer?.unref();
        this.timers.set(key, { runtimeId: runtime.pointer.runtimeId, timer });
        if (job.options.runOnActivation) queueMicrotask(invoke);
      }
    }
    for (const [key, current] of this.timers) {
      if (present.has(key)) continue;
      if (current.timer) clearInterval(current.timer);
      this.timers.delete(key);
    }
  }

  async onEvent(name: string, request: PluginWireRequest): Promise<void> {
    await Promise.allSettled(this.runtimes().flatMap((runtime) => runtime.description.jobs.filter((job) => job.options.event && (job.options.event.includes(":") ? job.options.event : `${runtime.slot.extensionId}:${job.options.event}`) === name).map((job) => this.run(runtime.slot.extensionId, job.name, request))));
  }

  run(pluginId: string, name: string, request?: PluginWireRequest): Promise<unknown> {
    if (this.closed) return Promise.reject(new AppError(503, "runtime-unavailable", "Die Plugin-Jobs wurden beendet."));
    const key = `${pluginId}:${name}`;
    const pending = this.running.get(key);
    if (pending) return pending;
    const runtime = this.runtimes().find((candidate) => candidate.slot.extensionId === pluginId);
    const job = runtime?.description.jobs.find((candidate) => candidate.name === name);
    if (!runtime || !job) return Promise.reject(new AppError(404, "not-found", "Der aktive Plugin-Job wurde nicht gefunden."));
    const run = this.execute(runtime, name, job.options.maxAttempts ?? 1, job.options.timeoutMs ?? this.defaultTimeoutMs, request);
    this.running.set(key, run);
    void run.then(() => this.running.delete(key), () => this.running.delete(key));
    return run;
  }

  history(pluginId: string, name?: string): unknown[] {
    const rows = (name
      ? this.database.prepare("SELECT * FROM plugin_job_runs WHERE plugin_id = ? AND name = ? ORDER BY started_at DESC, id DESC LIMIT 100").all(pluginId, name)
      : this.database.prepare("SELECT * FROM plugin_job_runs WHERE plugin_id = ? ORDER BY started_at DESC, id DESC LIMIT 100").all(pluginId)) as unknown as JobHistoryRow[];
    return rows.map((row) => ({ id: row.id, pluginId: row.plugin_id, name: row.name, status: row.status, startedAt: row.started_at, finishedAt: row.finished_at, error: row.error }));
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const timer of this.timers.values()) if (timer.timer) clearInterval(timer.timer);
    this.timers.clear();
    await Promise.allSettled([...this.running.values()]);
    this.database.close();
  }

  private async execute(runtime: ActiveCodePlugin, name: string, attempts: number, timeoutMs: number, request?: PluginWireRequest): Promise<unknown> {
    const id = randomUUID();
    this.database.prepare("INSERT INTO plugin_job_runs(id, plugin_id, name, status, started_at) VALUES (?, ?, ?, 'running', ?)").run(id, runtime.slot.extensionId, name, new Date().toISOString());
    try {
      let lastError: unknown;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        if (this.closed || !this.runtimes().some((candidate) => candidate.pointer.runtimeId === runtime.pointer.runtimeId)) throw new AppError(409, "runtime-unavailable", "Der Job wurde durch einen Plugin-Wechsel beendet.");
        try {
          const value = await runtime.process.call("job", { name, request: request ?? { userId: `plugin:${runtime.slot.extensionId}`, requestId: id } }, timeoutMs);
          this.database.prepare("UPDATE plugin_job_runs SET status = 'succeeded', finished_at = ? WHERE id = ?").run(new Date().toISOString(), id);
          this.prune(runtime.slot.extensionId);
          return value;
        } catch (error) { lastError = error; }
      }
      throw lastError;
    } catch (error) {
      this.database.prepare("UPDATE plugin_job_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?").run(new Date().toISOString(), redactText(error instanceof Error ? error.message : "Plugin-Job fehlgeschlagen"), id);
      this.prune(runtime.slot.extensionId);
      throw error;
    }
  }

  private prune(pluginId: string): void {
    this.database.prepare("DELETE FROM plugin_job_runs WHERE plugin_id = ? AND status != 'running' AND id NOT IN (SELECT id FROM plugin_job_runs WHERE plugin_id = ? ORDER BY started_at DESC, id DESC LIMIT 1000)").run(pluginId, pluginId);
  }
}
