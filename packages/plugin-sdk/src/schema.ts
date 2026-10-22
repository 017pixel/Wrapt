/** Zod und andere Standard-Schema-Validatoren können direkt verwendet werden. */
export interface PluginSchema<T = unknown> {
  parse(value: unknown): T;
}

export interface PluginMethod<I = unknown, O = unknown> {
  description?: string;
  input?: PluginSchema<I>;
  output?: PluginSchema<O>;
  handler(input: I, request: PluginRequest): O | Promise<O>;
}

export interface PluginRequest {
  userId: string;
  projectId?: string;
  signal: AbortSignal;
  requestId: string;
}

export interface PluginRegistration {
  dispose(): void | Promise<void>;
}

export type PluginCleanup = () => void | Promise<void>;
export type PluginJson = null | boolean | number | string | PluginJson[] | { [key: string]: PluginJson };

export function defineMethod<I, O>(definition: PluginMethod<I, O>): PluginMethod<I, O> {
  return definition;
}

export interface PluginRecord<T = Record<string, unknown>> {
  id: string;
  revision: number;
  value: T;
  createdAt: string;
  updatedAt: string;
}

export interface PluginCollection<T = Record<string, unknown>> {
  create(value: T): Promise<PluginRecord<T>>;
  list(query?: { limit?: number; offset?: number; filter?: Partial<T>; orderBy?: string; descending?: boolean }): Promise<PluginRecord<T>[]>;
  get(id: string): Promise<PluginRecord<T> | null>;
  put(id: string, value: T, options?: { expectedRevision?: number }): Promise<PluginRecord<T>>;
  remove(id: string, options?: { expectedRevision?: number }): Promise<boolean>;
}
