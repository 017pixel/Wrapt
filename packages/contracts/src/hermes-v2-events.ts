import { z } from "zod";
import { hermesV2IdSchema, hermesV2InflightSchema, hermesV2MessageSchema, hermesV2SelectionSchema,
  hermesV2SessionSchema, hermesV2TextSchema, hermesV2UsageSchema } from "./hermes-v2-sessions.js";
import { hermesV2RequestSchema } from "./hermes-v2-requests.js";
import { hermesV2SubagentSchema } from "./hermes-v2-catalog.js";
import { hermesV2ComposerSettingsSchema } from "./hermes-v2-composer.js";
import { hermesV2WorkPatchSchema } from "./hermes-v2-work.js";

const epoch = z.string().min(1).max(200);
export const hermesV2SnapshotSchema = z.strictObject({
  session: hermesV2SessionSchema, epoch, cursor: z.number().int().nonnegative(),
  writable: z.boolean(), blockedReason: z.string().max(500).nullable(),
  selection: hermesV2SelectionSchema.nullable(), reasoningEffort: z.string().max(100).nullable(),
  composer: hermesV2ComposerSettingsSchema.optional(),
  running: z.boolean().nullable(), turnStartedAt: z.number().nonnegative().nullable(),
  inflight: hermesV2InflightSchema.nullable(), queuedText: hermesV2TextSchema.nullable(),
  requests: z.array(hermesV2RequestSchema).max(100), messages: z.array(hermesV2MessageSchema).max(200),
  /** Nur eine bestätigte weitere Rohzeile belegt ältere Historie. */
  hasOlder: z.boolean().optional(),
});
const envelope = z.strictObject({ sessionId: hermesV2IdSchema.nullable(), epoch, seq: z.number().int().positive().nullable() });
const turn = z.string().min(1).max(200);
export const hermesV2EventSchema = z.discriminatedUnion("type", [
  envelope.extend({ type: z.literal("message.started"), payload: z.strictObject({ turnId: turn }) }),
  envelope.extend({ type: z.literal("message.delta"), payload: z.strictObject({ turnId: turn, text: hermesV2TextSchema }) }),
  envelope.extend({ type: z.literal("reasoning.delta"), payload: z.strictObject({ turnId: turn, text: hermesV2TextSchema }) }),
  envelope.extend({ type: z.literal("message.interim"), payload: z.strictObject({ turnId: turn, text: hermesV2TextSchema, alreadyStreamed: z.boolean() }) }),
  envelope.extend({ type: z.literal("message.completed"), payload: z.strictObject({
    turnId: turn, text: hermesV2TextSchema, reasoning: hermesV2TextSchema.nullable(),
    status: z.string().max(100), error: z.string().max(500).nullable(), recoverable: z.boolean(), usage: hermesV2UsageSchema.nullable(),
    readEvidence: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
    persistedTurn: z.strictObject({ userRowId: z.number().int().positive().nullable(), assistantRowId: z.number().int().positive().nullable(), complete: z.boolean() }).nullable(),
  }) }),
  envelope.extend({ type: z.literal("tool.generating"), payload: z.strictObject({ name: z.string().max(200) }) }),
  envelope.extend({ type: z.literal("tool.started"), payload: z.strictObject({ toolId: hermesV2IdSchema, name: z.string().max(200), input: z.string().max(65_536), preview: z.string().max(4_000) }) }),
  envelope.extend({ type: z.literal("tool.completed"), payload: z.strictObject({ toolId: hermesV2IdSchema, name: z.string().max(200), output: z.string().max(65_536), durationMs: z.number().nonnegative().nullable(), error: z.boolean().nullable() }) }),
  envelope.extend({ type: z.literal("session.updated"), payload: z.strictObject({ session: hermesV2SessionSchema, selection: hermesV2SelectionSchema.nullable(), turnStartedAt: z.number().nonnegative().nullable(), composer: hermesV2ComposerSettingsSchema.optional() }) }),
  envelope.extend({ type: z.literal("request.opened"), payload: hermesV2RequestSchema }),
  envelope.extend({ type: z.literal("request.closed"), payload: z.strictObject({ requestKey: z.string().uuid(), reason: z.string().max(200) }) }),
  envelope.extend({ type: z.literal("subagent.updated"), payload: hermesV2SubagentSchema }),
  envelope.extend({ type: z.literal("background.completed"), payload: z.strictObject({ taskId: hermesV2IdSchema, text: hermesV2TextSchema }) }),
  envelope.extend({ type: z.literal("work.updated"), payload: z.strictObject({ revision: z.number().int().nonnegative(), change: hermesV2WorkPatchSchema }) }),
  envelope.extend({ type: z.literal("work.invalidated"), payload: z.strictObject({ revision: z.number().int().nonnegative(), reason: z.enum(["roster", "queue"]) }) }),
  envelope.extend({ type: z.literal("sessions.invalidated"), payload: z.strictObject({}) }),
  envelope.extend({ type: z.literal("resources.invalidated"), payload: z.strictObject({ resource: z.enum(["cron", "sessions"]), sessionIds: z.array(hermesV2IdSchema).max(100) }) }),
  envelope.extend({ type: z.literal("metadata.invalidated"), payload: z.strictObject({ sessionId: hermesV2IdSchema, revision: z.number().int().nonnegative() }) }),
  envelope.extend({ type: z.literal("session.error"), payload: z.strictObject({ code: z.string().max(100), message: z.string().max(500), readEvidence: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional() }) }),
]);
export type HermesV2Snapshot = z.infer<typeof hermesV2SnapshotSchema>;
export type HermesV2Event = z.infer<typeof hermesV2EventSchema>;
