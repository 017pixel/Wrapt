import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginWireRequest } from "@wrapt/extension-contracts";
import type { PluginContext, PluginDefinition, PluginRequest, PluginCleanup, PluginHookEvent, PluginResourceProvider } from "@wrapt/plugin-sdk";
import { AppError } from "../utils/errors.js";
import { PluginDataStore } from "./code-data.js";
import type { PluginRpcPeer } from "./code-rpc.js";
import { PluginWorkerRegistry } from "./code-worker-registry.js";

export interface PluginWorkerBoot {
  id: string;
  version: string;
  entrypoint?: string;
  sourceDirectory: string;
  dataDirectory: string;
  releaseDirectory: string;
  requestTimeoutMs?: number;
}

export class PluginWorkerContext {
  readonly registry = new PluginWorkerRegistry();
  readonly data: PluginDataStore;
  private readonly controller = new AbortController();
  private readonly requests = new AsyncLocalStorage<PluginRequest>();
  private readonly cleanups: PluginCleanup[] = [];
  private readonly flushes: PluginCleanup[] = [];
  private readonly pending = new Set<Promise<unknown>>();
  private active = false;
  private frozen = false;
  private registryNotification = false;

  constructor(readonly boot: PluginWorkerBoot, private readonly peer: PluginRpcPeer) {
    this.data = new PluginDataStore(join(boot.dataDirectory, "data.sqlite"));
  }

  async setup(): Promise<unknown> {
    if (this.boot.entrypoint) {
      const module = await import(pathToFileURL(this.boot.entrypoint).href) as { default?: PluginDefinition };
      if (typeof module.default?.setup !== "function") throw new AppError(422, "activation-failed", "Der Server-Einstiegspunkt muss definePlugin({ setup }) exportieren.");
      const cleanup = await module.default.setup(this.context());
      if (typeof cleanup === "function") this.cleanups.push(cleanup);
    }
    return this.registry.describe(this.boot.id, this.boot.version);
  }

  async invoke(method: string, input: unknown): Promise<unknown> {
    const envelope = input as { name?: string; input?: unknown; request?: PluginWireRequest; id?: string; event?: unknown; action?: string; service?: string; method?: string; target?: string };
    if (method === "activate") { this.active = true; this.frozen = false; return null; }
    if (method === "freeze") {
      this.frozen = true;
      await Promise.allSettled([...this.pending]);
      for (const flush of this.flushes) await flush();
      await this.data.freeze();
      return null;
    }
    if (method === "thaw") { this.data.thaw(); this.frozen = false; return null; }
    if (method === "snapshot") { await this.data.snapshot(envelope.target!); return null; }
    if (method === "dispose") { await this.dispose(); return null; }
    if (method === "describe") return this.registry.describe(this.boot.id, this.boot.version);
    if (!this.active || this.frozen) throw new AppError(503, "runtime-unavailable", "Das Plugin wird gerade aktiviert oder gewechselt.");
    const request: PluginRequest = {
      ...envelope.request,
      userId: envelope.request?.userId ?? "plugin-job", requestId: envelope.request?.requestId ?? randomUUID(),
      signal: this.controller.signal,
    };
    const run = this.requests.run(request, async () => {
      if (method === "rpc" || method === "command") return this.registry.invoke(method, envelope.name!, envelope.input, request);
      if (method === "hook") {
        const hook = this.registry.hooks.get(envelope.id!);
        if (!hook) throw new AppError(404, "not-found", "Der Hook existiert nicht mehr.");
        const event = { ...(envelope.event as PluginHookEvent), request };
        await hook.handler(event);
        return { input: event.input, ...(event.result !== undefined ? { result: event.result } : {}), ...(event.cancelled !== undefined ? { cancelled: event.cancelled } : {}), ...(event.handled !== undefined ? { handled: event.handled } : {}), ...(event.reason ? { reason: event.reason } : {}) };
      }
      if (method === "event") {
        const event = envelope.event as { id: string; name: string; data: unknown };
        await Promise.all([...this.registry.events.get(event.name) ?? []].map((handler) => handler(event)));
        return null;
      }
      if (method === "job") {
        const job = this.registry.jobs.get(envelope.name!);
        if (!job) throw new AppError(404, "not-found", "Der Job existiert nicht.");
        await job.run(request);
        return null;
      }
      if (method === "service") {
        const definition = this.registry.services.get(envelope.service!)?.methods[envelope.method!];
        if (!definition) throw new AppError(404, "not-found", "Die Dienstmethode existiert nicht.");
        const result = await definition.handler(definition.input ? definition.input.parse(envelope.input) : envelope.input, request);
        return definition.output ? definition.output.parse(result) : result;
      }
      if (method === "resource") {
        const provider = this.registry.resources.get(envelope.name!);
        const operation = provider?.[envelope.action as keyof PluginResourceProvider];
        if (typeof operation !== "function") throw new AppError(404, "not-found", "Die Ressourcenaktion wird nicht unterstützt.");
        return operation(envelope.input, request);
      }
      throw new AppError(404, "not-found", "Unbekannte Plugin-Laufzeitaktion.");
    });
    this.pending.add(run);
    void run.then(() => this.pending.delete(run), () => this.pending.delete(run));
    return run;
  }

  private context(): PluginContext {
    const remote = <T = unknown>(method: string, input?: unknown): Promise<T> => {
      const request = this.requests.getStore();
      return this.peer.call<T>(method, { input, request: request ? { userId: request.userId, requestId: request.requestId, ...(request.projectId ? { projectId: request.projectId } : {}) } : undefined, staged: !this.active });
    };
    const changed = (): void => {
      if (!this.active || this.registryNotification) return;
      this.registryNotification = true;
      queueMicrotask(() => {
        this.registryNotification = false;
        if (this.active) void remote("registry.changed").catch(() => undefined);
      });
    };
    const registration = (value: { dispose(): void | Promise<void> }) => {
      const handle = { dispose: () => { const result = value.dispose(); changed(); return result; } };
      this.cleanups.push(() => handle.dispose());
      changed();
      return handle;
    };
    return {
      id: this.boot.id, version: this.boot.version, signal: this.controller.signal,
      paths: { source: this.boot.sourceDirectory, data: this.boot.dataDirectory, release: this.boot.releaseDirectory },
      effect: (cleanup) => { this.cleanups.push(cleanup); },
      lifecycle: { beforeSnapshot: (flush) => { this.flushes.push(flush); } },
      log: Object.fromEntries(["info", "warn", "error"].map((level) => [level, (message: string, data?: unknown) => { void remote("log", { level, message, data }).catch(() => undefined); }])) as PluginContext["log"],
      rpc: { register: (name, method) => registration(this.registry.register(this.registry.rpc, name, method)) },
      commands: { register: (name, definition) => registration(this.registry.register(this.registry.commands, name, definition)), execute: (name, input) => remote("commands.execute", { name, input }) },
      hooks: { register: (...args) => registration(this.registry.hook(...args)) },
      events: { on: (name, handler) => registration(this.registry.on(name, handler)), emit: (name, data) => remote("events.emit", { name, data }) },
      storage: this.data.api,
      resources: {
        register: (name, provider) => registration(this.registry.register(this.registry.resources, name, provider)),
        list: (name, input) => remote("resources.call", { name, action: "list", input }),
        get: (name, input) => remote("resources.call", { name, action: "get", input }),
        create: (name, input) => remote("resources.call", { name, action: "create", input }),
        update: (name, input) => remote("resources.call", { name, action: "update", input }),
        remove: (name, input) => remote("resources.call", { name, action: "remove", input }),
      },
      services: {
        call: (name, method, input) => remote("services.call", { name, method, input }),
        provide: (name, methods, options) => registration(this.registry.serviceContext((service, method, input) => remote("services.call", { name: service, method, input })).provide(name, methods, options)),
      },
      jobs: { register: (name, options, run) => registration(this.registry.registerJob(name, options, run)), run: (name) => remote("jobs.run", { name }), history: (name) => remote("jobs.history", { name }) },
      host: { call: (operation, input) => remote("host.call", { operation, input }), describe: () => remote("host.describe") },
    };
  }

  private async dispose(): Promise<void> {
    this.active = false;
    this.controller.abort();
    for (const cleanup of this.cleanups.reverse()) {
      try { await cleanup(); }
      catch (error) {
        try { await this.peer.call("log", { input: { level: "error", message: `Plugin-Cleanup fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}` } }); }
        catch { /* Der Host beendet die Runtime auch bei getrenntem Log-Kanal. */ }
      }
    }
    this.cleanups.length = 0;
    await this.data.close();
  }
}
