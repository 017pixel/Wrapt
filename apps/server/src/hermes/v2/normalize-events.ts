import { randomUUID } from "node:crypto";
import { hermesV2EventSchema, type HermesV2Event } from "@wrapt/contracts/hermes-v2";
import { z } from "zod";
import { parse } from "./upstream-schemas.js";
import { jsonText, nullableText, number, object, text, timestamp } from "./normalize-values.js";
import { normalizeSession, normalizeUsage, selection } from "./normalize-sessions.js";
import { normalizeSubagent } from "./normalize-catalog.js";
import { normalizeComposerSettings } from "./normalize-settings.js";
import type { SessionRecord, UpstreamEvent } from "./types.js";
import type { SecretRedactor } from "./secret-redactor.js";
import { observeSessionContext } from "./session-context.js";

export function normalizeEvent(event: UpstreamEvent, record: SessionRecord, secrets?: SecretRedactor): HermesV2Event | null {
  const raw = event.payload ?? {};
  const base = { sessionId: record.storedId, epoch: record.epoch, seq: event.session_id === record.liveId ? event.seq ?? null : null };
  const output = (type: string, payload: unknown) => hermesV2EventSchema.parse({ ...base, type, payload });
  if (event.type === "message.start") {
    record.turnId = randomUUID();
    record.snapshot.running = true;
    record.snapshot.session.running = true;
    return output("message.started", { turnId: record.turnId });
  }
  if (["message.delta", "thinking.delta", "reasoning.delta"].includes(event.type)) {
    parse(z.object({ text: z.string() }), raw);
    // Der vollständige validierte Rawchunk geht separat bis zum verbindungseigenen Streamabgleich.
    return output(event.type === "message.delta" ? "message.delta" : "reasoning.delta", { turnId: record.turnId, text: text(raw.text) });
  }
  if (event.type === "message.interim") {
    parse(z.object({ text: z.string(), already_streamed: z.boolean() }), raw);
    return output("message.interim", { turnId: record.turnId, text: text(raw.text, 200_000, secrets), alreadyStreamed: raw.already_streamed });
  }
  if (event.type === "message.complete") {
    const persisted = object(raw.persisted_turn);
    const positiveId = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
    record.snapshot.running = false;
    record.snapshot.session.running = false;
    record.snapshot.session.draft = false;
    record.snapshot.inflight = null;
    return output("message.completed", {
      turnId: record.turnId, text: text(raw.text, 200_000, secrets), reasoning: nullableText(raw.reasoning, 200_000, secrets), status: text(raw.status, 100) || "completed",
      error: raw.error ? "Der Hermes-Turn ist fehlgeschlagen." : null, recoverable: raw.recoverable === true, usage: normalizeUsage(raw.usage),
      persistedTurn: raw.persisted_turn ? { userRowId: positiveId(persisted.user_row_id), assistantRowId: positiveId(persisted.final_assistant_row_id), complete: persisted.complete === true } : null,
    });
  }
  if (event.type === "tool.generating") {
    parse(z.object({ name: z.string() }), raw);
    return output("tool.generating", { name: text(raw.name, 200, secrets) });
  }
  if (event.type === "tool.start" || event.type === "tool.complete") {
    parse(z.object({ tool_id: z.string().min(1), name: z.string().min(1) }), raw);
    const common = { toolId: raw.tool_id, name: text(raw.name, 200, secrets) };
    if (event.type === "tool.start") return output("tool.started", { ...common, input: jsonText(raw.args ?? raw.args_text ?? "", 65_536, secrets), preview: text(raw.preview, 4_000, secrets) });
    const result = object(raw.result);
    return output("tool.completed", { ...common, output: jsonText(raw.result_text ?? raw.result ?? raw.summary ?? "", 65_536, secrets), durationMs: typeof raw.duration_s === "number" ? number(raw.duration_s) * 1_000 : null, error: typeof result.success === "boolean" ? !result.success : result.error ? true : null });
  }
  if (event.type === "session.info" || event.type === "session.title") {
    if (event.type === "session.info") record.snapshot.composer = normalizeComposerSettings(raw);
    if (event.type === "session.info") observeSessionContext(record, raw);
    record.snapshot.session = normalizeSession(record.storedId, raw, record.snapshot.session);
    record.snapshot.selection = selection(raw) ?? record.snapshot.selection;
    if (typeof raw.running === "boolean") record.snapshot.running = raw.running;
    record.snapshot.turnStartedAt = timestamp(raw.turn_started_at) ?? record.snapshot.turnStartedAt;
    return output("session.updated", { session: record.snapshot.session, selection: record.snapshot.selection, turnStartedAt: record.snapshot.turnStartedAt, ...(record.snapshot.composer ? { composer: record.snapshot.composer } : {}) });
  }
  if (event.type.startsWith("subagent.")) {
    const agent = normalizeSubagent(raw, secrets);
    return agent ? output("subagent.updated", agent) : null;
  }
  if (event.type === "background.complete" || event.type === "btw.complete") {
    return output("background.completed", { taskId: raw.task_id, text: text(raw.text, 200_000, secrets) });
  }
  if (event.type === "error") return output("session.error", { code: "OPERATION_FAILED", message: "Hermes hat einen Fehler gemeldet." });
  return null;
}
