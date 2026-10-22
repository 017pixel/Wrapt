import { z } from "zod";
import { hermesV2IdSchema, hermesV2SelectionSchema } from "./hermes-v2-sessions.js";

export const hermesV2CommandSchema = z.strictObject({
  key: z.string().min(1).max(200), label: z.string().max(200), description: z.string().max(2_000),
  kind: z.enum(["builtin", "skill", "unsupported"]),
  action: z.enum(["new", "resume", "stop", "model", "help", "queue", "steer", "title", "skill"]).nullable(),
  argumentHint: z.string().max(200).nullable(), disabledReason: z.string().max(500).nullable(),
  aliases: z.array(z.string().min(1).max(200)).max(100).optional(),
  argumentMode: z.enum(["options", "text", "mixed"]).nullable().optional(),
  subcommands: z.array(z.string().max(200)).max(100).optional(),
  desktopSubcommands: z.array(z.string().max(200)).max(100).nullable().optional(),
});
export const hermesV2ModelCatalogSchema = z.strictObject({
  providers: z.array(z.strictObject({
    id: z.string().min(1).max(100), label: z.string().max(200), available: z.boolean(),
    reportedModelCount: z.number().int().nonnegative().optional(), note: z.string().max(500).nullable().optional(),
    models: z.array(z.strictObject({
      id: z.string().min(1).max(200), label: z.string().max(200),
      reasoningEfforts: z.array(z.string().max(40)).max(20), fast: z.boolean(),
      priceInput: z.string().max(100).nullable(), priceOutput: z.string().max(100).nullable(),
      reportedReasoning: z.boolean().nullable().optional(), canDisableReasoning: z.boolean().nullable().optional(),
    })).max(2_000),
  })).max(100), current: hermesV2SelectionSchema.nullable(),
});
export const hermesV2SubagentSchema = z.strictObject({
  id: hermesV2IdSchema, parentId: hermesV2IdSchema.nullable(), goal: z.string().max(10_000),
  status: z.string().max(100), model: z.string().max(200).nullable(),
  startedAt: z.number().nonnegative().nullable(), durationMs: z.number().nonnegative().nullable(),
  toolCount: z.number().int().nonnegative(), lastTool: z.string().max(200).nullable(),
});
export const hermesV2BackgroundSchema = z.strictObject({
  id: hermesV2IdSchema, command: z.string().max(4_000), status: z.string().max(100),
  startedAt: z.number().nonnegative().nullable(), output: z.string().max(16_384),
});
export type HermesV2Command = z.infer<typeof hermesV2CommandSchema>;
export type HermesV2ModelCatalog = z.infer<typeof hermesV2ModelCatalogSchema>;
export type HermesV2Subagent = z.infer<typeof hermesV2SubagentSchema>;
