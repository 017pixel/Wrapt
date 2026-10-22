import { z } from "zod";
import { hermesV2ResourceActionSchema, hermesV2ResourceScopeSchema } from "./hermes-v2-resources.js";
import { hermesV2IdSchema } from "./hermes-v2-sessions.js";

export const hermesV2CronIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,200}$/).refine((id) => id !== "unknown");
export const hermesV2CronRepeatSchema = z.union([z.number().int().positive(), z.string().trim().min(1).max(100), z.null()]);
export const hermesV2CronFieldsSchema = z.strictObject({ name: z.string().max(200), prompt: z.string().max(20_000),
  schedule: z.string().trim().min(1).max(1000), repeat: hermesV2CronRepeatSchema, paused: z.boolean(), projectId: hermesV2IdSchema.nullable() });
export const hermesV2CronCreateSchema = hermesV2ResourceActionSchema.extend(hermesV2CronFieldsSchema.shape);
export const hermesV2CronUpdateSchema = hermesV2ResourceActionSchema.extend({ updates: hermesV2CronFieldsSchema.partial().refine((value) => Object.keys(value).length > 0) });
export const hermesV2CronConfirmSchema = hermesV2ResourceActionSchema.extend({ confirm: z.literal(true) });
export const hermesV2CronExtraSchema = z.strictObject({ key: z.string().max(200), value: z.string().max(4000), truncated: z.boolean() });
export const hermesV2CronJobSchema = z.strictObject({ id: hermesV2CronIdSchema, name: z.string().max(200), prompt: z.string().max(20_000),
  schedule: z.string().max(1000).nullable(), repeat: hermesV2CronRepeatSchema, completedRuns: z.number().int().nonnegative().nullable(),
  paused: z.boolean().nullable(), state: z.string().max(100).nullable(), nextRunAt: z.string().max(200).nullable(), lastRunAt: z.string().max(200).nullable(),
  lastStatus: z.string().max(200).nullable(), lastError: z.string().max(4000).nullable(), workdir: z.string().max(4096).nullable(),
  execution: z.strictObject({ mode: z.enum(["agent", "script", "unknown"]), script: z.string().max(4000).nullable(), noAgent: z.boolean().nullable() }),
  additional: z.array(hermesV2CronExtraSchema).max(50), valid: z.boolean(), truncated: z.boolean() });
export const hermesV2CronListSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, jobs: z.array(hermesV2CronJobSchema).max(100), truncated: z.boolean() });
export const hermesV2CronDetailSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, job: hermesV2CronJobSchema });
export const hermesV2CronRunsQuerySchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(20) });
export const hermesV2CronRunsSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, jobId: hermesV2CronIdSchema,
  runs: z.array(z.strictObject({ id: z.string().max(200).nullable(), startedAt: z.number().nonnegative().nullable(),
    status: z.string().max(100).nullable(), text: z.string().max(16_384), truncated: z.boolean() })).max(100), truncated: z.boolean() });
export const hermesV2CronMutationSchema = z.strictObject({ scope: hermesV2ResourceScopeSchema, outcome: z.literal("confirmed"),
  operation: z.enum(["create", "update", "pause", "resume", "trigger", "delete"]), jobId: hermesV2CronIdSchema, job: hermesV2CronJobSchema.nullable() });
export type HermesV2CronJob = z.infer<typeof hermesV2CronJobSchema>;
export type HermesV2CronFields = z.infer<typeof hermesV2CronFieldsSchema>;
export type HermesV2CronCreate = z.infer<typeof hermesV2CronCreateSchema>;
export type HermesV2CronUpdate = z.infer<typeof hermesV2CronUpdateSchema>;
export type HermesV2CronList = z.infer<typeof hermesV2CronListSchema>;
export type HermesV2CronDetail = z.infer<typeof hermesV2CronDetailSchema>;
export type HermesV2CronRuns = z.infer<typeof hermesV2CronRunsSchema>;
export type HermesV2CronMutation = z.infer<typeof hermesV2CronMutationSchema>;
