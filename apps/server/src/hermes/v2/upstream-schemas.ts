import { z } from "zod";
import { hermesV2IdSchema } from "@wrapt/contracts/hermes-v2";
import { protocolError } from "./errors.js";

const id = hermesV2IdSchema;
export const readySchema = z.object({
  replay_epoch: z.string().min(1).max(200), heartbeat: z.literal(true), change_events: z.boolean().optional(),
});
// server._broadcast_global_event sendet für diese Core-Ereignisse session_id="".
const globalEvents = new Set(["gateway.ready", "sessions.changed", "skin.changed", "session.reclaimed", "approval.cancelled",
  "display.status", "display.lease", "display.install.log", "display.install.done", "connection.update", "pet.changed",
  "cron.changed", "platforms.changed", "projects.changed", "pairing.changed", "bot_relay.outbox.pending"]);
export const eventSchema = z.object({
  type: z.string().min(1).max(100), session_id: z.union([id, z.literal("")]).optional(),
  seq: z.number().int().positive().optional(), payload: z.record(z.string(), z.unknown()).optional(),
}).refine((event) => event.session_id !== "" || globalEvents.has(event.type));
export const requestFrameSchema = z.object({
  jsonrpc: z.literal("2.0"), id: z.string().regex(/^srq-[A-Za-z0-9-]+$/).max(200),
  method: z.string().min(1).max(100), params: z.record(z.string(), z.unknown()),
});
export const infoSchema = z.object({ cwd: z.string().min(1).max(4_096), desktop_contract: z.union([z.literal(8), z.literal("8")]) }).passthrough();
export const sessionReplySchema = z.object({
  session_id: id, stored_session_id: id.optional(), session_key: id.optional(), resumed: id.optional(),
  info: infoSchema, message_count: z.number().int().nonnegative(),
  messages: z.array(z.unknown()).optional(), running: z.boolean().optional(),
  inflight: z.record(z.string(), z.unknown()).nullable().optional(),
  queued: z.object({ user: z.string() }).nullable().optional(),
  open_requests: z.array(requestFrameSchema.omit({ jsonrpc: true })).max(100).optional(),
}).passthrough();
export const replaySchema = z.object({
  events: z.array(eventSchema).max(512), latest_seq: z.number().int().nonnegative(),
  truncated: z.boolean(), count: z.number().int().nonnegative(), epoch: z.string().min(1).max(200),
  open_requests: z.array(requestFrameSchema.omit({ jsonrpc: true })).max(100),
});
export const detailSchema = z.object({ id, cwd: z.string().max(4_096).nullable().optional() }).passthrough();
export const historySchema = z.object({ session_id: id, profile: z.string().optional(), messages: z.array(z.unknown()).max(500) });
export const listSchema = z.object({ sessions: z.array(z.object({ id }).passthrough()).max(10_000) });
export const activeSchema = z.object({ sessions: z.array(z.object({ id, session_key: id, status: z.string() }).passthrough()).max(1_000) });

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw protocolError();
  return result.data;
}
