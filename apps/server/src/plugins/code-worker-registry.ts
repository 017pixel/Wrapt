import { randomUUID } from "node:crypto";
import { pluginJobOptionsSchema, pluginRuntimeDescriptionSchema, pluginRuntimeNameSchema, type PluginRuntimeDescription } from "@wrapt/extension-contracts";
import type { PluginContext, PluginHookEvent, PluginJobOptions, PluginMethod, PluginRegistration, PluginRequest, PluginResourceProvider } from "@wrapt/plugin-sdk";
import { AppError } from "../utils/errors.js";

interface Hook { id: string; operation: string; phase: "before" | "after"; priority: number; handler(event: PluginHookEvent): void | Promise<void> }
interface Service { methods: Record<string, PluginMethod>; version: string; replace?: string }
interface Job { options: PluginJobOptions; run(request: PluginRequest): void | Promise<void> }

export class PluginWorkerRegistry {
  readonly rpc = new Map<string, PluginMethod>();
  readonly commands = new Map<string, PluginMethod & { title: string }>();
  readonly hooks = new Map<string, Hook>();
  readonly events = new Map<string, Set<(event: { id: string; name: string; data: unknown }) => void | Promise<void>>>();
  readonly resources = new Map<string, PluginResourceProvider>();
  readonly services = new Map<string, Service>();
  readonly jobs = new Map<string, Job>();

  register<T>(collection: Map<string, T>, name: string, value: T): PluginRegistration {
    pluginRuntimeNameSchema.parse(name);
    if (collection.has(name)) throw new AppError(409, "contribution-collision", `Der Plugin-Beitrag ${name} existiert bereits.`);
    collection.set(name, value);
    return { dispose: () => { collection.delete(name); } };
  }

  hook(operation: string, phase: "before" | "after", handler: Hook["handler"], options?: { priority?: number }): PluginRegistration {
    pluginRuntimeNameSchema.parse(operation);
    const id = randomUUID();
    const priority = options?.priority ?? 0;
    if (!Number.isSafeInteger(priority)) throw new AppError(400, "VALIDATION_ERROR", "Hook-Prioritäten sind ganze Zahlen.");
    this.hooks.set(id, { id, operation, phase, handler, priority });
    return { dispose: () => { this.hooks.delete(id); } };
  }

  on(name: string, handler: (event: { id: string; name: string; data: unknown }) => void | Promise<void>): PluginRegistration {
    pluginRuntimeNameSchema.parse(name);
    const handlers = this.events.get(name) ?? new Set();
    handlers.add(handler);
    this.events.set(name, handlers);
    return { dispose: () => { handlers.delete(handler); if (handlers.size === 0) this.events.delete(name); } };
  }

  registerJob(name: string, options: PluginJobOptions, run: Job["run"]): PluginRegistration {
    return this.register(this.jobs, name, { options: pluginJobOptionsSchema.parse(options), run });
  }

  describe(id: string, version: string): PluginRuntimeDescription {
    return pluginRuntimeDescriptionSchema.parse({
      id, version, rpc: [...this.rpc.keys()],
      commands: [...this.commands].map(([name, value]) => ({ name, title: value.title })),
      hooks: [...this.hooks.values()].map(({ id: hookId, operation, phase, priority }) => ({ id: hookId, operation, phase, priority })),
      events: [...this.events.keys()],
      resources: [...this.resources].map(([name, value]) => ({ name, description: value.description ?? "", methods: ["list", "get", "create", "update", "remove"].filter((method) => typeof value[method as keyof PluginResourceProvider] === "function") })),
      services: [...this.services].map(([name, value]) => ({ name, version: value.version, methods: Object.keys(value.methods), ...(value.replace ? { replace: value.replace } : {}) })),
      jobs: [...this.jobs].map(([name, value]) => ({ name, options: value.options })),
    });
  }

  async invoke(kind: string, name: string, input: unknown, request: PluginRequest): Promise<unknown> {
    const method = kind === "rpc" ? this.rpc.get(name) : kind === "command" ? this.commands.get(name) : undefined;
    if (!method) throw new AppError(404, "not-found", `Die Plugin-Methode ${name} existiert nicht.`);
    const parsed = method.input ? method.input.parse(input) : input;
    const result = await method.handler(parsed, request);
    return method.output ? method.output.parse(result) : result;
  }

  serviceContext(call: PluginContext["services"]["call"]): PluginContext["services"] {
    return {
      call,
      provide: (name, methods, options) => {
        for (const key of Object.keys(methods)) pluginRuntimeNameSchema.parse(key);
        return this.register(this.services, name, { methods, version: options?.version ?? "1.0.0", ...(options?.replace ? { replace: options.replace } : {}) });
      },
    };
  }
}
