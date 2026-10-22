import { z } from "zod";
import { hermesV2IdSchema, type HermesV2ClientMessage, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import type { GatewayManager } from "../manager.js";
import type { MutationOutcome } from "../mutation-outcome.js";
import { GatewayError } from "../errors.js";
import { parse } from "../upstream-schemas.js";
import { boundedOutput, boundedOutputResult, workText } from "./normalize.js";
import { readNativeRoster } from "./roster.js";

export type WorkOperation = Extract<HermesV2ClientMessage, { op: `work.${string}` }>;
export const isWorkOperation = (message: HermesV2ClientMessage): message is WorkOperation => message.op.startsWith("work.");
export async function performWork(manager: GatewayManager, connection: string, message: WorkOperation, outcome: MutationOutcome): Promise<HermesV2ServerMessage> {
  if (!manager.connections.get(connection)?.work) throw new GatewayError("FORBIDDEN", "Diese Verbindung erlaubt keine Laufaufgaben.");
  const base = { v: 1 as const, type: "result" as const, id: message.id };
  if (message.op === "work.read") return { ...base, op: message.op, data: await manager.work.read(connection, message.sessionId) };
  const binding = await manager.work.capture(connection, message.sessionId); binding.assert();
  if (message.op === "work.background" || message.op === "work.btw") {
    const kind = message.op === "work.btw" ? "btw" : "background";
    await binding.current(); binding.assert();
    const receipt = manager.work.receipts.begin(binding.record, kind);
    try {
      const value = parse(z.object({ task_id: hermesV2IdSchema }), await outcome.call(manager.upstream,
        kind === "btw" ? "prompt.btw" : "prompt.background", { session_id: binding.live, text: message.text }));
      binding.assert(); await binding.current(); binding.assert();
      const known = manager.work.state.get(binding.record).tasks.get(`${kind}\0${value.task_id}`);
      const status = known?.status === "completed" ? "completed" : manager.work.receipts.status(receipt, value.task_id);
      if (status === "unknown") throw new GatewayError("STALE_REQUEST", "Die Abschlussabdeckung der Nebenaufgabe ist unvollständig.");
      manager.work.publish(binding.record, { kind, id: value.task_id, status });
      return kind === "btw" ? { ...base, op: "work.btw", data: { kind, taskId: value.task_id } }
        : { ...base, op: "work.background", data: { kind, taskId: value.task_id } };
    } finally { manager.work.receipts.end(binding.record, receipt); }
  }
  const roster = await readNativeRoster(manager.upstream, binding.live!, manager.policy.workRows, manager.secrets);
  binding.assert();
  const child = message.op === "work.subagent.interrupt" || message.op === "work.subagent.tail";
  const target = "subagentId" in message ? message.subagentId : message.processId;
  if (!(child ? roster.subagents : roster.processes).some((row) => row.id === target))
    throw new GatewayError("FORBIDDEN", "Dieses Ziel gehört nicht zum aktuellen eigenen Roster.");
  await binding.current(); binding.assert();
  if (message.op === "work.subagent.tail") {
    const value = parse(z.object({ subagent_id: z.literal(target), available: z.boolean(), text: z.string(), truncated: z.boolean() }),
      await manager.upstream.call("subagent.tail", { session_id: binding.live, subagent_id: target }));
    binding.assert(); await binding.current(); binding.assert();
    const output = boundedOutputResult(value.text, manager.secrets);
    return { ...base, op: message.op, data: { id: target, available: value.available, text: output.text,
      truncated: value.truncated || output.truncated } };
  }
  if (message.op === "work.subagent.interrupt") {
    const value = parse(z.object({ subagent_id: z.literal(target), found: z.boolean() }), await outcome.call(manager.upstream,
      "subagent.interrupt", { session_id: binding.live, subagent_id: target }));
    binding.assert(); await binding.current(); binding.assert(); manager.work.invalidate(binding.record, "roster");
    return { ...base, op: message.op, data: { id: target, found: value.found } };
  }
  const value = parse(z.object({ status: z.enum(["killed", "already_exited", "not_found", "error"]),
    session_id: z.string().nullable().optional(), exit_code: z.number().int().nullable().optional(), output: z.string().nullable().optional(), error: z.string().nullable().optional() }),
  await outcome.call(manager.upstream, "process.kill", { session_id: binding.live, process_id: target }));
  binding.assert(); await binding.current(); binding.assert();
  if (value.session_id != null && value.session_id !== target) throw new GatewayError("PROTOCOL_MISMATCH", "Die Prozessantwort gehört zu einem anderen Ziel.");
  manager.work.invalidate(binding.record, "roster");
  return { ...base, op: "work.process.kill", data: { id: target, status: value.status, exitCode: value.exit_code ?? null,
    output: boundedOutput(value.output, manager.secrets), error: typeof value.error === "string" ? workText(value.error, 4_000, manager.secrets) : null } };
}
