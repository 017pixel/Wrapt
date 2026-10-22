import { z } from "zod";
import type { HermesV2ClientMessage, HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import type { GatewayManager } from "./manager.js";
import type { SessionRecord } from "./types.js";
import type { MutationOutcome } from "./mutation-outcome.js";
import { GatewayError } from "./errors.js";
import { normalizeModels } from "./normalize-catalog.js";
import { normalizeComposerSettings } from "./normalize-settings.js";
import { parse, sessionReplySchema } from "./upstream-schemas.js";

type Input = Extract<HermesV2ClientMessage, { op: "session.title"|"reasoning.select"|"composer.approvals" }>;
export async function performComposerOperation(manager: GatewayManager, connection: string, record: SessionRecord, input: Input, outcome: MutationOutcome): Promise<HermesV2ServerMessage> {
  if (!manager.connections.get(connection)?.composer) throw new GatewayError("UNSUPPORTED_COMMAND", "Diese Verbindung unterstützt die Composerfunktion nicht.");
  const guard = manager.mutationGuard(connection, record);
  await manager.sessions.writable(record); guard();
  const base = { v: 1 as const, id: input.id, type: "result" as const };
  if (input.op === "session.title") {
    const value = parse(z.object({ title: z.string().min(1).max(200), pending: z.boolean() }),
      await outcome.call(manager.upstream, "session.title", { session_id: record.liveId, title: input.title }));
    guard();
    record.snapshot.session.title = value.title;
    manager.invalidateCatalog();
    return { ...base, op: input.op, data: value };
  }
  if (input.op === "composer.approvals") {
    parse(z.object({ key: z.literal("approvals.mode"), value: z.literal(input.mode) }),
      await outcome.call(manager.upstream, "config.set", { session_id: record.liveId, key: "approvals.mode", value: input.mode }));
    guard();
    const after = parse(sessionReplySchema, await manager.upstream.call("session.activate", { session_id: record.liveId, omit_messages: true }));
    guard();
    const observed = normalizeComposerSettings(after.info);
    record.snapshot.composer = observed;
    return { ...base, op: input.op, data: { mode: input.mode, observed } };
  }
  const catalog = normalizeModels(await manager.upstream.call("model.options", { session_id: record.liveId })); guard();
  const model = catalog.providers.find((provider) => provider.available && provider.id === input.selection.provider)?.models.find((model) => model.id === input.selection.model);
  const current = catalog.current;
  if (!model || !current || current.model !== input.selection.model || current.provider !== input.selection.provider || model.reportedReasoning === false
    || (input.effort === "none" && model.canDisableReasoning !== true)) throw new GatewayError("INVALID_MESSAGE", "Das aktuelle Modell unterstützt diese Auswahl nicht nachweislich.");
  const before = parse(sessionReplySchema, await manager.upstream.call("session.activate", { session_id: record.liveId, omit_messages: true })); guard();
  const idleSelection = (reply: z.infer<typeof sessionReplySchema>) => {
    const running = typeof reply.running === "boolean" ? reply.running : reply.info.running;
    if (running !== false) throw new GatewayError("SESSION_UNAVAILABLE", "Reasoning kann nur in einer bestätigten ruhenden Session geändert werden.");
    if (reply.info.model !== input.selection.model || reply.info.provider !== input.selection.provider)
      throw new GatewayError("STALE_REQUEST", "Die Modellauswahl hat sich geändert.");
  };
  idleSelection(before);
  const last = await manager.sessions.writable(record); guard();
  idleSelection(last);
  if (record.snapshot.running !== false) throw new GatewayError("SESSION_UNAVAILABLE", "Die Session arbeitet inzwischen wieder.");
  const value = parse(z.object({ key: z.literal("reasoning"), value: z.literal(input.effort) }), await outcome.call(manager.upstream, "config.set", {
    session_id: record.liveId, key: "reasoning", value: input.effort, scope: "session",
  }));
  guard();
  const after = parse(sessionReplySchema, await manager.upstream.call("session.activate", { session_id: record.liveId, omit_messages: true })); guard();
  const observed = normalizeComposerSettings(after.info);
  record.snapshot.composer = observed;
  return { ...base, op: input.op, data: { requested: value.value, observed, observation: observed.reasoning.effort === input.effort ? "observed" : "unconfirmed" } };
}
