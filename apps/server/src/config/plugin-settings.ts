import { z } from "zod";
import { absoluteFilesystemPathSchema } from "@wrapt/contracts";

export const pluginRuntimeConfigSchema = z.object({
  // Safe Mode lädt weder Servercode noch Browsercode persönlicher Plugins.
  safeMode: z.boolean().default(false),
  requestTimeoutMs: z.number().int().min(100).max(120_000).default(10_000),
  buildTimeoutMs: z.number().int().min(1_000).max(300_000).default(30_000),
  shutdownTimeoutMs: z.number().int().min(100).max(30_000).default(3000),
  sourceWatchIntervalMs: z.number().int().min(500).max(60_000).default(1500),
  maxLogEntries: z.number().int().min(20).max(2000).default(200),
});

export const pluginSettingsSchema = z.object({
  wraptPluginsSkillPath: absoluteFilesystemPathSchema.optional(),
  creatorSkillPath: absoluteFilesystemPathSchema.optional(),
  runtime: pluginRuntimeConfigSchema.optional(),
}).prefault({});

export const defaultPluginRuntimeConfig = pluginRuntimeConfigSchema.parse({});
export type PluginRuntimeConfig = z.infer<typeof pluginRuntimeConfigSchema>;
