import { z } from "zod";
import { hermesV2IdSchema as id, hermesV2TextSchema } from "./hermes-v2-sessions.js";

const time = z.number().nonnegative().nullable();
export const hermesV2WorkStatusSchema = z.enum(["queued", "running", "completed", "failed", "error", "timeout", "interrupted"]);
export const hermesV2WorkSubagentSchema = z.strictObject({
  kind: z.literal("subagent"), id, parentId: id.nullable(), depth: z.number().int().nonnegative().nullable(),
  delegationId: id.nullable(), goal: z.string().max(10_000).nullable(), model: z.string().max(200).nullable(),
  startedAt: time, status: hermesV2WorkStatusSchema.nullable(), toolCount: z.number().int().nonnegative().nullable(),
  lastTool: z.string().max(200).nullable(), acceptingSteer: z.boolean().nullable(), durationMs: time,
});
export const hermesV2WorkDelegationSchema = z.strictObject({
  kind: z.literal("delegation"), delegationId: id, taskIndex: z.number().int().nonnegative(),
  status: z.string().max(100).nullable(), goal: z.string().max(10_000).nullable(), error: z.string().max(4_000).nullable(),
  dispatchedAt: time, completedAt: time,
});
export const hermesV2WorkProcessSchema = z.strictObject({
  kind: z.literal("process"), id, command: z.string().max(4_000).nullable(), status: z.string().max(100).nullable(),
  startedAt: time, uptimeSeconds: z.number().nonnegative().nullable(), output: z.string().max(16_384),
  exitCode: z.number().int().nullable(),
});
export const hermesV2WorkTaskSchema = z.strictObject({
  kind: z.enum(["background", "btw"]), id, status: z.enum(["running", "completed"]), text: hermesV2TextSchema.nullable(),
});
export const hermesV2WorkPatchSchema = z.union([
  hermesV2WorkSubagentSchema.partial().required({ kind: true, id: true }),
  hermesV2WorkDelegationSchema.partial().required({ kind: true, delegationId: true, taskIndex: true }),
  hermesV2WorkTaskSchema.partial().required({ kind: true, id: true }),
]);
export const hermesV2WorkRosterSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  subagents: z.array(hermesV2WorkSubagentSchema).max(100),
  delegations: z.array(hermesV2WorkDelegationSchema).max(100),
  processes: z.array(hermesV2WorkProcessSchema).max(100), tasks: z.array(hermesV2WorkTaskSchema).max(100),
  queuedText: hermesV2TextSchema.nullable(),
  coverage: z.strictObject({
    subagents: z.literal("live-and-observed"), delegations: z.literal("recent-failures-partial"),
    processes: z.literal("session"), tasks: z.literal("observed-partial"), queue: z.literal("next-only"), truncated: z.boolean(),
  }),
});
export const hermesV2WorkKillSchema = z.strictObject({
  id, status: z.enum(["killed", "already_exited", "not_found", "error"]), exitCode: z.number().int().nullable(),
  output: z.string().max(16_384), error: z.string().max(4_000).nullable(),
});
export type HermesV2WorkSubagent = z.infer<typeof hermesV2WorkSubagentSchema>;
export type HermesV2WorkDelegation = z.infer<typeof hermesV2WorkDelegationSchema>;
export type HermesV2WorkProcess = z.infer<typeof hermesV2WorkProcessSchema>;
export type HermesV2WorkTask = z.infer<typeof hermesV2WorkTaskSchema>;
export type HermesV2WorkPatch = z.infer<typeof hermesV2WorkPatchSchema>;
export type HermesV2WorkRoster = z.infer<typeof hermesV2WorkRosterSchema>;
