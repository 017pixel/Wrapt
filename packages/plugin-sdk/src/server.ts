import type { PluginCleanup, PluginCollection, PluginMethod, PluginRegistration, PluginRequest, PluginSchema } from "./schema.js";

export interface PluginHookEvent {
  operation: string;
  input: unknown;
  result?: unknown;
  cancelled?: boolean;
  handled?: boolean;
  reason?: string;
  request: PluginRequest;
}

export interface PluginResourceProvider {
  list(input: unknown, request: PluginRequest): Promise<unknown> | unknown;
  get?(input: unknown, request: PluginRequest): Promise<unknown> | unknown;
  create?(input: unknown, request: PluginRequest): Promise<unknown> | unknown;
  update?(input: unknown, request: PluginRequest): Promise<unknown> | unknown;
  remove?(input: unknown, request: PluginRequest): Promise<unknown> | unknown;
  description?: string;
}

export interface PluginJobOptions {
  everyMs?: number;
  event?: string;
  runOnActivation?: boolean;
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface PluginContext {
  readonly id: string;
  readonly version: string;
  readonly signal: AbortSignal;
  readonly paths: { source: string; data: string; release: string };
  effect(cleanup: PluginCleanup): void;
  lifecycle: { beforeSnapshot(flush: PluginCleanup): void };
  log: { info(message: string, data?: unknown): void; warn(message: string, data?: unknown): void; error(message: string, data?: unknown): void };
  rpc: { register<I, O>(name: string, method: PluginMethod<I, O>): PluginRegistration };
  commands: {
    register<I, O>(name: string, definition: PluginMethod<I, O> & { title: string }): PluginRegistration;
    execute(name: string, input?: unknown): Promise<unknown>;
  };
  hooks: { register(operation: string, phase: "before" | "after", handler: (event: PluginHookEvent) => void | Promise<void>, options?: { priority?: number }): PluginRegistration };
  events: {
    on(name: string, handler: (event: { id: string; name: string; data: unknown }) => void | Promise<void>): PluginRegistration;
    emit(name: string, data: unknown): Promise<void>;
  };
  storage: {
    get<T = unknown>(key: string): Promise<T | null>;
    set(key: string, value: unknown): Promise<void>;
    remove(key: string): Promise<boolean>;
    collection<T extends Record<string, unknown> = Record<string, unknown>>(name: string, options?: { schema?: PluginSchema<T>; indexes?: string[] }): PluginCollection<T>;
    migrate(version: number, migration: (storage: PluginContext["storage"]) => Promise<void>): Promise<void>;
    transaction<T>(operation: () => Promise<T>): Promise<T>;
  };
  resources: {
    register(name: string, provider: PluginResourceProvider): PluginRegistration;
    list(name: string, input?: unknown): Promise<unknown>;
    get(name: string, input?: unknown): Promise<unknown>;
    create(name: string, input: unknown): Promise<unknown>;
    update(name: string, input: unknown): Promise<unknown>;
    remove(name: string, input: unknown): Promise<unknown>;
  };
  services: {
    provide(name: string, methods: Record<string, PluginMethod>, options?: { version?: string; replace?: string }): PluginRegistration;
    call(name: string, method: string, input?: unknown): Promise<unknown>;
  };
  jobs: {
    register(name: string, options: PluginJobOptions, run: (request: PluginRequest) => Promise<void> | void): PluginRegistration;
    run(name: string): Promise<unknown>;
    history(name?: string): Promise<unknown>;
  };
  host: { call<T = unknown>(operation: string, input?: unknown): Promise<T>; describe(): Promise<unknown> };
}

export interface PluginDefinition {
  setup(context: PluginContext): void | PluginCleanup | Promise<void | PluginCleanup>;
}

export function definePlugin<T extends PluginDefinition>(definition: T): T {
  return definition;
}
