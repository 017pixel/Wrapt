import { randomUUID } from "node:crypto";
import { pluginRuntimeDescriptionSchema, pluginRuntimeNameSchema, type PluginWireRequest } from "@wrapt/extension-contracts";
import type { PluginRequest } from "@wrapt/plugin-sdk";
import { AppError } from "../utils/errors.js";
import { redactSensitive, redactText } from "../utils/redaction.js";
import type { PluginRuntimeConfig } from "../config/plugin-settings.js";
import type { PluginHostApi } from "./code-host-api.js";
import { PluginJobScheduler } from "./code-jobs.js";
import type { ActiveCodePlugin } from "./code-runtime-host.js";

interface RemoteEnvelope {
  input?: { name?: string; method?: string; action?: string; operation?: string; input?: unknown; data?: unknown; level?: string; message?: string };
  request?: PluginWireRequest;
  staged?: boolean;
}

interface PluginEvent { id: string; name: string; data: unknown }
interface HookResult { input: unknown; result?: unknown; handled?: boolean; cancelled?: boolean; reason?: string }
export interface PluginLogEntry { timestamp: string; pluginId: string; level: string; message: string }

function qualified(owner: string, name: string): string { return name.includes(":") ? name : `${owner}:${name}`; }

/** Vermittelt ausschließlich öffentliche Host- und Plugin-Schnittstellen. */
export class PluginRuntimeHub {
  readonly jobs: PluginJobScheduler;
  private readonly logs: PluginLogEntry[] = [];
  private readonly listeners = new Set<(event: PluginEvent) => void>();
  private readonly depth = new Map<string, number>();

  constructor(
    readonly api: PluginHostApi,
    private readonly runtimes: () => readonly ActiveCodePlugin[],
    jobDatabasePath: string,
    private readonly config: PluginRuntimeConfig,
  ) {
    this.jobs = new PluginJobScheduler(jobDatabasePath, runtimes, config.requestTimeoutMs);
  }

  async handle(pluginId: string, method: string, raw: unknown): Promise<unknown> {
    const envelope = raw as RemoteEnvelope;
    const input = envelope.input ?? {};
    const request = this.request(envelope.request, pluginId);
    if (method === "log") { this.log(pluginId, input.level ?? "info", input.message ?? "", input.data); return null; }
    if (method === "host.describe") return this.describe();
    if (method === "host.call") {
      const info = this.api.info(input.operation!);
      if (envelope.staged && info.mutates) throw new AppError(409, "activation-failed", "Host-Mutationen sind während der Plugin-Vorbereitung gesperrt.");
      return this.callHost(info.name, input.input, request, envelope.staged === true);
    }
    if (envelope.staged) throw new AppError(409, "activation-failed", "Plugin-Aktionen dürfen erst nach der erfolgreichen Aktivierung starten.");
    if (method === "commands.execute") {
      const name = this.runtime(pluginId).description.commands.some((command) => command.name === input.name) ? qualified(pluginId, input.name!) : input.name!;
      return this.command(name, input.input, request);
    }
    if (method === "resources.call") return this.resource(qualified(pluginId, input.name!), input.action!, input.input, request);
    if (method === "services.call") return this.service(qualified(pluginId, input.name!), input.method!, input.input, request);
    if (method === "events.emit") {
      const name = qualified(pluginId, pluginRuntimeNameSchema.parse(input.name));
      if (name.startsWith("host:")) throw new AppError(403, "permissions-denied", "Host-Ereignisse können nur vom Host veröffentlicht werden.");
      await this.emit(name, input.data, request);
      return null;
    }
    if (method === "jobs.run") return this.jobs.run(pluginId, input.name!, this.wire(request));
    if (method === "jobs.history") return this.jobs.history(pluginId, input.name);
    if (method === "registry.changed") {
      const runtime = this.runtime(pluginId);
      runtime.description = pluginRuntimeDescriptionSchema.parse(await runtime.process.call("describe"));
      this.changed();
      return null;
    }
    throw new AppError(404, "not-found", "Die Plugin-Host-Aktion existiert nicht.");
  }

  describe(): unknown {
    return { apiVersion: "1.0.0", host: this.api.describe(), plugins: this.runtimes().map((runtime) => runtime.description) };
  }

  async rpc(pluginId: string, name: string, input: unknown, request: PluginRequest): Promise<unknown> {
    const runtime = this.runtime(pluginId);
    if (!runtime.description.rpc.includes(name)) throw new AppError(404, "not-found", "Die Plugin-RPC-Methode ist nicht registriert.");
    return this.pipeline(`${pluginId}:rpc/${name}`, input, request, (value) => runtime.process.call("rpc", { name, input: value, request: this.wire(request) }));
  }

  async callHost(operation: string, input: unknown, request: PluginRequest, staged = false): Promise<unknown> {
    const info = this.api.info(operation);
    const result = staged || !info.hookable ? await this.api.call(operation, input, request)
      : await this.pipeline(operation, input, request, async (value) => {
        const split = operation.lastIndexOf(".");
        const serviceName = `host:${operation.slice(0, split)}`;
        if (split > 0 && this.runtimes().some((runtime) => runtime.description.services.some((service) => service.replace === serviceName))) return this.service(serviceName, operation.slice(split + 1), value, request);
        return this.api.call(operation, value, request);
      }, (value) => this.api.validateResult(operation, value));
    if (info.mutates && !staged) await this.emit(`host:${operation}`, { input, result }, request);
    return result;
  }

  async command(name: string, input: unknown, request: PluginRequest): Promise<unknown> {
    const match = this.runtimes().flatMap((runtime) => runtime.description.commands.map((command) => ({ runtime, command })))
      .find(({ runtime, command }) => qualified(runtime.slot.extensionId, command.name) === name);
    if (!match) throw new AppError(404, "not-found", `Der Plugin-Command ${name} ist nicht registriert.`);
    return this.pipeline(name, input, request, (value) => match.runtime.process.call("command", { name: match.command.name, input: value, request: this.wire(request) }));
  }

  async resource(name: string, action: string, input: unknown, request: PluginRequest): Promise<unknown> {
    const match = this.runtimes().flatMap((runtime) => runtime.description.resources.map((resource) => ({ runtime, resource })))
      .find(({ runtime, resource }) => qualified(runtime.slot.extensionId, resource.name) === name);
    if (!match && name.startsWith("host:")) return this.callHost(`${name.slice(5)}.${action}`, input, request);
    if (!match || !match.resource.methods.includes(action as "list")) throw new AppError(404, "not-found", "Der Ressourcenanbieter unterstützt diese Aktion nicht.");
    return this.pipeline(`${name}/${action}`, input, request, (value) => match.runtime.process.call("resource", { name: match.resource.name, action, input: value, request: this.wire(request) }));
  }

  async service(name: string, method: string, input: unknown, request: PluginRequest): Promise<unknown> {
    const providers = this.runtimes().flatMap((runtime) => runtime.description.services.map((service) => ({ runtime, service })))
      .filter(({ runtime, service }) => qualified(runtime.slot.extensionId, service.name) === name || service.replace === name);
    const replacements = providers.filter(({ service }) => service.replace === name);
    if (replacements.length > 1) throw new AppError(409, "contribution-collision", `Mehrere Plugins ersetzen den Dienst ${name}.`);
    const match = replacements[0] ?? providers[0];
    if (!match || !match.service.methods.includes(method)) throw new AppError(404, "not-found", "Die öffentliche Plugin-Dienstmethode existiert nicht.");
    return this.pipeline(`${name}/${method}`, input, request, (value) => match.runtime.process.call("service", { service: match.service.name, method, input: value, request: this.wire(request) }));
  }

  async emit(name: string, data: unknown, request: PluginRequest): Promise<void> {
    const event = { id: randomUUID(), name, data };
    for (const listener of this.listeners) { try { listener(event); } catch { /* Ein getrennter Client blockiert keine Verarbeitung. */ } }
    await Promise.allSettled(this.runtimes().flatMap((runtime) => runtime.description.events
      .filter((subscription) => qualified(runtime.slot.extensionId, subscription) === name)
      .map(async (subscription) => {
        try { await runtime.process.call("event", { event: { ...event, name: subscription }, request: this.wire(request) }); }
        catch (error) { this.log(runtime.slot.extensionId, "error", error instanceof Error ? error.message : "Ereignisverarbeitung fehlgeschlagen"); }
      })));
    await this.jobs.onEvent(name, this.wire(request));
  }

  subscribe(listener: (event: PluginEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  changed(): void {
    this.jobs.sync();
    const event = { id: randomUUID(), name: "host:plugins.changed", data: null };
    for (const listener of this.listeners) { try { listener(event); } catch { /* Client wird separat aufgeräumt. */ } }
  }

  log(pluginId: string, level: string, message: string, data?: unknown): void {
    const suffix = data === undefined ? "" : ` ${JSON.stringify(redactSensitive(data))}`;
    this.logs.push({ timestamp: new Date().toISOString(), pluginId, level, message: redactText(`${message}${suffix}`, 8000) });
    if (this.logs.length > this.config.maxLogEntries) this.logs.splice(0, this.logs.length - this.config.maxLogEntries);
  }

  logEntries(pluginId?: string): PluginLogEntry[] { return this.logs.filter((entry) => pluginId === undefined || entry.pluginId === pluginId); }
  async close(): Promise<void> { this.listeners.clear(); await this.jobs.close(); }

  private async pipeline(operation: string, input: unknown, request: PluginRequest, invoke: (input: unknown) => Promise<unknown>, validate: (result: unknown) => unknown = (value) => value): Promise<unknown> {
    const depth = this.depth.get(request.requestId) ?? 0;
    if (depth >= 16) throw new AppError(409, "operation-conflict", "Die Plugin-Aufrufkette enthält zu viele verschachtelte Aktionen.");
    this.depth.set(request.requestId, depth + 1);
    try {
      let event: HookResult = { input };
      const hooks = this.runtimes().flatMap((runtime) => runtime.description.hooks.map((hook) => ({ runtime, hook })))
        .filter(({ hook }) => hook.operation === operation)
        .sort((a, b) => a.hook.priority - b.hook.priority || a.runtime.slot.extensionId.localeCompare(b.runtime.slot.extensionId));
      for (const { runtime, hook } of hooks.filter(({ hook }) => hook.phase === "before")) {
        event = await runtime.process.call<HookResult>("hook", { id: hook.id, event: { ...event, operation }, request: this.wire(request) });
        if (event.cancelled) throw new AppError(409, "operation-cancelled", event.reason ?? "Die Aktion wurde durch ein Plugin abgebrochen.");
      }
      event.result = validate(event.handled ? event.result : await invoke(event.input));
      for (const { runtime, hook } of hooks.filter(({ hook }) => hook.phase === "after")) {
        try {
          const next = await runtime.process.call<HookResult>("hook", { id: hook.id, event: { ...event, operation }, request: this.wire(request) });
          next.result = validate(next.result);
          event = next;
        }
        catch (error) { this.log(runtime.slot.extensionId, "error", `Die Aktion ${operation} ist abgeschlossen; ein nachgelagerter Hook ist fehlgeschlagen: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`); }
      }
      return event.result;
    } finally {
      if (depth === 0) this.depth.delete(request.requestId);
      else this.depth.set(request.requestId, depth);
    }
  }

  private runtime(id: string): ActiveCodePlugin {
    const runtime = this.runtimes().find((value) => value.slot.extensionId === id);
    if (!runtime) throw new AppError(404, "runtime-unavailable", "Das persönliche Plugin ist nicht aktiv.");
    return runtime;
  }

  private request(request: PluginWireRequest | undefined, pluginId: string): PluginRequest {
    return { userId: request?.userId ?? `plugin:${pluginId}`, requestId: request?.requestId ?? randomUUID(), ...(request?.projectId ? { projectId: request.projectId } : {}), signal: new AbortController().signal };
  }

  private wire(request: PluginRequest): PluginWireRequest { return { userId: request.userId, requestId: request.requestId, ...(request.projectId ? { projectId: request.projectId } : {}) }; }
}
