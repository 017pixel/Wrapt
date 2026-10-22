import { z } from "zod";
import { hermesV2IdSchema, hermesV2MessageSchema, hermesV2SelectionSchema, hermesV2SessionSchema, hermesV2TextSchema } from "./hermes-v2-sessions.js";
import { hermesV2EventSchema, hermesV2SnapshotSchema } from "./hermes-v2-events.js";
import { hermesV2ResponseSchema } from "./hermes-v2-requests.js";
import { hermesV2BackgroundSchema, hermesV2CommandSchema, hermesV2ModelCatalogSchema, hermesV2SubagentSchema } from "./hermes-v2-catalog.js";
import { hermesV2EffortSchema, hermesV2ComposerSettingsSchema, hermesV2ApprovalModeSchema } from "./hermes-v2-composer.js";
import { hermesV2AttachmentIdSchema } from "./hermes-v2-attachments.js";
import { hermesV2WorkRosterSchema, hermesV2WorkKillSchema } from "./hermes-v2-work.js";

const base = z.strictObject({ v: z.literal(1), id: z.string().uuid() });
const session = base.extend({ sessionId: hermesV2IdSchema });
const request = session.extend({ requestKey: z.string().uuid(), epoch: z.string().min(1).max(200) });
export const hermesV2ClientMessageSchema = z.discriminatedUnion("op", [
  base.extend({ op: z.literal("sessions.list"), query: z.string().max(200).optional(), limit: z.number().int().min(1).max(100).optional() }),
  base.extend({ op: z.literal("session.create"), projectId: hermesV2IdSchema.nullable(), title: z.string().max(200).optional(), selection: hermesV2SelectionSchema.optional() }),
  session.extend({ op: z.literal("session.subscribe"), cursor: z.strictObject({ epoch: z.string().min(1).max(200), seq: z.number().int().nonnegative() }).optional() }),
  session.extend({ op: z.literal("session.unsubscribe") }),
  session.extend({ op: z.literal("history.read"), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).max(1_000_000).optional() }),
  session.extend({ op: z.literal("message.submit"), text: hermesV2TextSchema, mode: z.enum(["normal", "queue"]).optional(),
    attachmentIds: z.array(hermesV2AttachmentIdSchema).min(1).max(10).refine((ids) => new Set(ids).size === ids.length).optional(),
  }).refine((message) => message.text.length > 0 || (message.attachmentIds?.length ?? 0) > 0),
  session.extend({ op: z.literal("session.stop") }),
  session.extend({ op: z.literal("session.steer"), text: hermesV2TextSchema.min(1) }),
  session.extend({ op: z.literal("catalog.read") }),
  session.extend({ op: z.literal("model.select"), selection: hermesV2SelectionSchema, confirmed: z.boolean().optional() }),
  session.extend({ op: z.literal("session.title"), title: z.string().trim().min(1).max(200) }),
  session.extend({ op: z.literal("reasoning.select"), effort: hermesV2EffortSchema, selection: hermesV2SelectionSchema }),
  session.extend({ op: z.literal("composer.approvals"), mode: hermesV2ApprovalModeSchema }),
  request.extend({ op: z.literal("request.respond"), response: hermesV2ResponseSchema }),
  request.extend({ op: z.literal("request.lock"), questionId: hermesV2IdSchema, answer: z.string().max(65_536).nullable() }),
  session.extend({ op: z.literal("subagents.read") }),
  session.extend({ op: z.literal("work.read") }),
  session.extend({ op: z.literal("work.subagent.interrupt"), subagentId: hermesV2IdSchema }),
  session.extend({ op: z.literal("work.subagent.tail"), subagentId: hermesV2IdSchema }),
  session.extend({ op: z.literal("work.process.kill"), processId: hermesV2IdSchema }),
  session.extend({ op: z.literal("work.background"), text: hermesV2TextSchema.min(1) }),
  session.extend({ op: z.literal("work.btw"), text: hermesV2TextSchema.min(1) }),
]);
export const hermesV2ErrorCodeSchema = z.enum(["INVALID_MESSAGE", "FORBIDDEN", "PROJECT_FORBIDDEN", "SESSION_NOT_FOUND", "SESSION_UNAVAILABLE", "STALE_REQUEST", "REQUEST_CLAIMED", "UNSUPPORTED_COMMAND", "MODEL_CONFIRM_REQUIRED", "RATE_LIMITED", "GATEWAY_OFFLINE", "PROTOCOL_MISMATCH", "PAYLOAD_TOO_LARGE", "OPERATION_FAILED"]);
const result = base.extend({ type: z.literal("result") });
const status = z.strictObject({ status: z.string().max(100) });
const results = [
  result.extend({ op: z.literal("sessions.list"), data: z.strictObject({ sessions: z.array(hermesV2SessionSchema).max(100), hasMore: z.boolean() }) }),
  result.extend({ op: z.literal("session.create"), data: z.strictObject({ snapshot: hermesV2SnapshotSchema }) }),
  result.extend({ op: z.literal("session.subscribe"), data: z.strictObject({ snapshot: hermesV2SnapshotSchema }) }),
  result.extend({ op: z.literal("session.unsubscribe"), data: z.strictObject({ unsubscribed: z.literal(true) }) }),
  result.extend({ op: z.literal("history.read"), data: z.strictObject({ sessionId: hermesV2IdSchema, messages: z.array(hermesV2MessageSchema).max(200), offset: z.number().int().nonnegative(), returned: z.number().int().nonnegative(), hasMore: z.boolean() }) }),
  result.extend({ op: z.literal("message.submit"), data: z.strictObject({ status: z.enum(["streaming", "queued", "steered", "redirected"]), userRowId: z.number().int().positive().nullable() }) }),
  result.extend({ op: z.literal("session.stop"), data: status }),
  result.extend({ op: z.literal("session.steer"), data: z.strictObject({ status: z.enum(["queued", "redirected", "rejected"]) }) }),
  result.extend({ op: z.literal("catalog.read"), data: z.strictObject({ commands: z.array(hermesV2CommandSchema).max(2_000), models: hermesV2ModelCatalogSchema, hermesEfforts: z.array(hermesV2EffortSchema).max(8).optional() }) }),
  result.extend({ op: z.literal("session.title"), data: z.strictObject({ title: z.string().max(200), pending: z.boolean() }) }),
  result.extend({ op: z.literal("reasoning.select"), data: z.strictObject({ requested: hermesV2EffortSchema, observed: hermesV2ComposerSettingsSchema, observation: z.enum(["observed", "unconfirmed"]) }) }),
  result.extend({ op: z.literal("composer.approvals"), data: z.strictObject({ mode: hermesV2ApprovalModeSchema, observed: hermesV2ComposerSettingsSchema }) }),
  result.extend({ op: z.literal("model.select"), data: z.strictObject({ selection: hermesV2SelectionSchema, deferred: z.boolean(), confirmation: z.string().max(2_000).nullable() }) }),
  result.extend({ op: z.literal("request.respond"), data: z.strictObject({ status: z.enum(["sent", "settled"]) }) }),
  result.extend({ op: z.literal("request.lock"), data: z.strictObject({ remaining: z.array(hermesV2IdSchema).max(5), settled: z.boolean() }) }),
  result.extend({ op: z.literal("subagents.read"), data: z.strictObject({ subagents: z.array(hermesV2SubagentSchema).max(100), background: z.array(hermesV2BackgroundSchema).max(100) }) }),
  result.extend({ op: z.literal("work.read"), data: hermesV2WorkRosterSchema }),
  result.extend({ op: z.literal("work.subagent.interrupt"), data: z.strictObject({ id: hermesV2IdSchema, found: z.boolean() }) }),
  result.extend({ op: z.literal("work.subagent.tail"), data: z.strictObject({ id: hermesV2IdSchema, available: z.boolean(), text: z.string().max(16_384), truncated: z.boolean() }) }),
  result.extend({ op: z.literal("work.process.kill"), data: hermesV2WorkKillSchema }),
  result.extend({ op: z.literal("work.background"), data: z.strictObject({ kind: z.literal("background"), taskId: hermesV2IdSchema }) }),
  result.extend({ op: z.literal("work.btw"), data: z.strictObject({ kind: z.literal("btw"), taskId: hermesV2IdSchema }) }),
] as const;
export const hermesV2ServerMessageSchema = z.union([
  z.discriminatedUnion("op", results),
  z.strictObject({ v: z.literal(1), type: z.literal("connection"), state: z.enum(["connecting", "online", "reconnecting", "offline", "incompatible"]), epoch: z.string().max(200).nullable(), connectionId: z.string().uuid().optional() }),
  z.strictObject({ v: z.literal(1), type: z.literal("error"), id: z.string().uuid().nullable(), code: hermesV2ErrorCodeSchema, message: z.string().max(500), retryable: z.boolean(), outcome: z.enum(["not_sent", "unknown"]) }),
  z.strictObject({ v: z.literal(1), type: z.literal("event"), event: hermesV2EventSchema }),
  z.strictObject({ v: z.literal(1), type: z.literal("snapshot"), snapshot: hermesV2SnapshotSchema }),
]);
export type HermesV2ClientMessage = z.infer<typeof hermesV2ClientMessageSchema>;
export type HermesV2ServerMessage = z.infer<typeof hermesV2ServerMessageSchema>;
export type HermesV2ErrorCode = z.infer<typeof hermesV2ErrorCodeSchema>;
