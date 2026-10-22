import { z } from "zod";
import { hermesV2IdSchema, hermesV2EffortSchema, type HermesV2ClientMessage, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { GatewayError } from "./errors.js";
import { normalizeCommands, normalizeModels, normalizeSubagent } from "./normalize-catalog.js";
import { object, text, timestamp } from "./normalize-values.js";
import { parse } from "./upstream-schemas.js";
import type { GatewayManager } from "./manager.js";
import type { MutationOutcome } from "./mutation-outcome.js";
import { performComposerOperation } from "./composer-operations.js";
import { performWork, isWorkOperation } from "./work/operations.js";

export async function performOperation(manager: GatewayManager, connectionId: string, message: HermesV2ClientMessage, outcome: MutationOutcome): Promise<HermesV2ServerMessage> {
  const base = { v: 1 as const, type: "result" as const, id: message.id };
  const connectionGuard = manager.mutationGuard(connectionId);
  connectionGuard();
  if (message.op === "sessions.list") return { ...base, op: message.op, data: await manager.sessions.list(message.query, message.limit ?? 50) };
  if (message.op === "session.create") {
    if (message.selection) await requireModel(manager, message.selection);
    const record = await manager.sessions.create(message, connectionGuard, outcome);
    record.subscribers.add(connectionId);
    manager.subscriptions.attach(connectionId, record.storedId);
    try { return { ...base, op: message.op, data: { snapshot: await manager.snapshot(record) } }; }
    catch (error) {
      manager.abortSnapshot(record);
      record.subscribers.delete(connectionId);
      manager.subscriptions.detach(connectionId, record.storedId);
      throw error;
    }
  }
  if (message.op === "session.subscribe") {
    const existing = manager.sessions.records.get(message.sessionId);
    if (existing) existing.hydrationRevision = (existing.hydrationRevision ?? 0) + 1;
    const record = await manager.sessions.attach(message.sessionId, connectionGuard, outcome);
    connectionGuard();
    const subscribed = record.subscribers.has(connectionId);
    if (!subscribed) manager.finishStream(connectionId, record.storedId);
    record.subscribers.add(connectionId);
    manager.subscriptions.attach(connectionId, record.storedId);
    try { return { ...base, op: message.op, data: { snapshot: await manager.snapshot(record) } }; }
    catch (error) {
      manager.abortSnapshot(record);
      if (!subscribed) { record.subscribers.delete(connectionId); manager.subscriptions.detach(connectionId, record.storedId); }
      manager.registry.detach(manager.principal, connectionId, record.storedId);
      throw error;
    }
  }
  const record = manager.requireSession(message.sessionId, connectionId);
  const mutationGuard = manager.mutationGuard(connectionId, record);
  if (message.op === "session.unsubscribe") {
    manager.finishStream(connectionId, record.storedId);
    record.subscribers.delete(connectionId);
    manager.subscriptions.detach(connectionId, record.storedId);
    manager.registry.detach(manager.principal, connectionId, record.storedId);
    return { ...base, op: message.op, data: { unsubscribed: true } };
  }
  if (message.op === "history.read") return { ...base, op: message.op, data: await manager.sessions.history(message.sessionId, message.limit ?? 200, message.offset ?? 0) };
  if (isWorkOperation(message)) return performWork(manager, connectionId, message, outcome);
  if (message.op === "catalog.read") {
    if (!record.liveId) throw new GatewayError("SESSION_UNAVAILABLE", "Die Session ist nur lesbar.");
    const [commands, models] = await Promise.all([
      manager.upstream.call("commands.catalog", { session_id: record.liveId }),
      manager.upstream.call("model.options", { session_id: record.liveId }),
    ]);
    return { ...base, op: message.op, data: { commands: normalizeCommands(commands), models: normalizeModels(models, manager.connections.get(connectionId)?.composer === true), hermesEfforts: hermesV2EffortSchema.options } };
  }
  if (message.op === "session.title" || message.op === "reasoning.select" || message.op === "composer.approvals") return performComposerOperation(manager, connectionId, record, message, outcome);
  if (message.op === "request.respond") {
    if (!record.liveId) throw new GatewayError("STALE_REQUEST", "Diese Anfrage ist nicht mehr verfügbar.");
    await manager.sessions.writable(record);
    await manager.syncRequests(record);
    mutationGuard();
    const answer = manager.registry.claim(message.requestKey, manager.requestContext(record, connectionId, message.epoch), message.response, () => {
      if (message.response.kind === "secret") manager.secrets.remember(message.response.value);
    });
    try {
      await outcome.respond(manager.upstream, answer.id, answer.result);
      await manager.syncRequests(record);
      return { ...base, op: message.op, data: { status: "sent" } };
    } catch (error) {
      const failure = outcome.error(error);
      if (failure.outcome === "not_sent") manager.registry.unlock(message.requestKey, answer.token);
      throw failure;
    }
  }
  if (message.op === "request.lock") {
    await manager.sessions.writable(record);
    await manager.syncRequests(record);
    mutationGuard();
    const claim = manager.registry.lock(message.requestKey, manager.requestContext(record, connectionId, message.epoch), message.questionId, message.answer);
    let confirmed = false;
    try {
      const result = parse(z.object({ status: z.enum(["ok", "expired"]), remaining: z.array(z.string()).optional() }), await outcome.call(manager.upstream, "clarify.lock", { request_id: claim.id, question_id: message.questionId, answer: message.answer }));
      confirmed = true;
      await manager.syncRequests(record);
      return { ...base, op: message.op, data: { remaining: result.remaining ?? [], settled: !result.remaining?.length } };
    } catch (error) {
      const failure = outcome.error(error);
      if (failure.outcome === "not_sent") confirmed = true;
      throw failure;
    } finally { if (confirmed) manager.registry.unlock(message.requestKey, claim.token); }
  }
  if (message.op === "subagents.read") {
    if (!record.liveId) return { ...base, op: message.op, data: { subagents: [], background: [] } };
    const [subagents, processes] = await Promise.all([
      manager.upstream.call("subagent.list", { session_id: record.liveId }),
      manager.upstream.call("process.list", { session_id: record.liveId }),
    ]);
    const agents = parse(z.object({ subagents: z.array(z.unknown()).max(100) }), subagents);
    const background = parse(z.object({ processes: z.array(z.object({ session_id: hermesV2IdSchema }).passthrough()).max(100) }), processes);
    return { ...base, op: message.op, data: {
      subagents: agents.subagents.flatMap((entry) => { const agent = normalizeSubagent(entry, manager.secrets); return agent ? [agent] : []; }),
      background: background.processes.map((entry) => {
        const row = object(entry);
        const display = (value: unknown, limit: number) => text(typeof value === "string" ? manager.secrets.boundedText(value, limit) : value, limit);
        return { id: String(row.session_id), command: display(row.command, 4_000), status: text(row.status, 100), startedAt: timestamp(row.started_at), output: display(row.output_tail ?? row.output_preview, 16_384) };
      }),
    } };
  }
  await manager.sessions.writable(record);
  if (message.op === "message.submit") {
    if (message.attachmentIds?.length && (!manager.connections.get(connectionId)?.composer || !manager.attachments))
      throw new GatewayError("UNSUPPORTED_COMMAND", "Dateianhänge sind in dieser Verbindung nicht verfügbar.");
    const prepared = message.attachmentIds?.length
      ? await manager.attachments!.resolveForSubmit(manager, connectionId, record.storedId, message.attachmentIds, message.text) : null;
    mutationGuard();
    prepared?.assert();
    const value = parse(z.object({ status: z.enum(["streaming", "queued", "steered", "redirected"]), user_row_id: z.number().int().positive().optional() }), await outcome.call(manager.upstream, "prompt.submit", { session_id: record.liveId, text: prepared?.text ?? message.text, ...(message.mode === "queue" ? { queued: true } : {}) }));
    if (prepared) {
      await prepared.recheck();
      prepared.assert();
      manager.attachments!.used(manager.principal, message.attachmentIds!, value.user_row_id ?? null);
    }
    record.snapshot.running = true;
    record.snapshot.session.running = true;
    if (value.user_row_id) record.snapshot.session.draft = false;
    manager.work.invalidate(record, "queue");
    return { ...base, op: message.op, data: { status: value.status, userRowId: value.user_row_id ?? null } };
  }
  if (message.op === "session.stop" || message.op === "session.steer") {
    mutationGuard();
    const statusSchema = message.op === "session.stop" ? z.enum(["interrupted", "not_interrupted"]) : z.enum(["queued", "redirected", "rejected"]);
    const value = parse(z.object({ status: statusSchema }), await outcome.call(manager.upstream, message.op === "session.stop" ? "session.interrupt" : "session.steer", { session_id: record.liveId, ...(message.op === "session.steer" ? { text: message.text } : {}) }));
    manager.work.invalidate(record, "queue");
    return message.op === "session.steer" ? { ...base, op: "session.steer", data: { status: z.enum(["queued", "redirected", "rejected"]).parse(value.status) } }
      : { ...base, op: "session.stop", data: value };
  }
  const catalog = await requireModel(manager, message.selection, record.liveId!);
  const known = catalog.providers.find((provider) => provider.id === message.selection.provider)!;
  const selected = known.models.find((model) => model.id === message.selection.model)!;
  mutationGuard();
  const value = parse(z.object({ confirm_required: z.boolean().optional(), confirm_message: z.string().optional(), deferred: z.boolean().optional() }), await outcome.call(manager.upstream, "config.set", {
    session_id: record.liveId, key: "model", value: `${selected.id} --provider ${known.id} --session`,
    ...(message.confirmed === true ? { confirm_expensive_model: true } : {}),
  }));
  return { ...base, op: "model.select", data: { selection: message.selection, deferred: value.deferred === true, confirmation: value.confirm_required ? text(value.confirm_message, 2_000) || "Modellwechsel bestätigen." : null } };
}

async function requireModel(manager: GatewayManager, selected: { provider: string; model: string }, liveId?: string) {
  if (![selected.provider, selected.model].every((value) => /^[A-Za-z0-9_./:@+~-]+$/.test(value) && !value.startsWith("-"))) {
    throw new GatewayError("INVALID_MESSAGE", "Die Modellkennung ist ungültig.");
  }
  const catalog = normalizeModels(await manager.upstream.call("model.options", liveId ? { session_id: liveId } : {}));
  if (!catalog.providers.some((provider) => provider.id === selected.provider && provider.available && provider.models.some((model) => model.id === selected.model))) {
    throw new GatewayError("INVALID_MESSAGE", "Dieses Modell ist im aktuellen Hermes-Katalog nicht verfügbar.");
  }
  return catalog;
}
