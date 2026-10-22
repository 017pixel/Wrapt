import { z } from "zod";
import { extensionIdSchema } from "./ids.js";
import { semanticVersionSchema } from "./versioning.js";

export const pluginRuntimeNameSchema = z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/);

export const pluginJobOptionsSchema = z.strictObject({
  everyMs: z.number().int().min(1000).max(2_592_000_000).optional(),
  event: pluginRuntimeNameSchema.optional(),
  runOnActivation: z.boolean().optional(),
  timeoutMs: z.number().int().min(100).max(3_600_000).optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});

export const pluginRuntimeDescriptionSchema = z.strictObject({
  id: extensionIdSchema,
  version: semanticVersionSchema,
  rpc: z.array(pluginRuntimeNameSchema).max(256),
  commands: z.array(z.strictObject({ name: pluginRuntimeNameSchema, title: z.string().min(1).max(120) })).max(256),
  hooks: z.array(z.strictObject({ id: z.string(), operation: pluginRuntimeNameSchema, phase: z.enum(["before", "after"]), priority: z.number().int() })).max(256),
  events: z.array(pluginRuntimeNameSchema).max(256),
  resources: z.array(z.strictObject({ name: pluginRuntimeNameSchema, methods: z.array(z.enum(["list", "get", "create", "update", "remove"])), description: z.string() })).max(128),
  services: z.array(z.strictObject({ name: pluginRuntimeNameSchema, version: semanticVersionSchema, methods: z.array(pluginRuntimeNameSchema), replace: z.string().optional() })).max(128),
  jobs: z.array(z.strictObject({ name: pluginRuntimeNameSchema, options: pluginJobOptionsSchema })).max(128),
});

export type PluginRuntimeDescription = z.infer<typeof pluginRuntimeDescriptionSchema>;

export interface PluginWireRequest {
  userId: string;
  requestId: string;
  projectId?: string;
}
