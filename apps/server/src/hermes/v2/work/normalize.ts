import { hermesV2IdSchema, hermesV2WorkStatusSchema, type HermesV2WorkSubagent, type HermesV2WorkDelegation,
  type HermesV2WorkProcess, type HermesV2WorkPatch } from "@wrapt/contracts/hermes-v2";
import { nullableText, object, text, timestamp } from "../normalize-values.js";
import type { UpstreamEvent } from "../types.js";
import type { SecretRedactor } from "../secret-redactor.js";

export function workTextResult(value: unknown, limit: number, secrets?: SecretRedactor): { text: string; truncated: boolean } {
  if (typeof value !== "string") return { text: "", truncated: false };
  const masked = secrets?.bounded(value, limit) ?? { text: value, truncated: false };
  const normalized = text(masked.text, Number.MAX_SAFE_INTEGER);
  return { text: normalized.slice(0, limit), truncated: masked.truncated || normalized.length > limit };
}
export const workText = (value: unknown, limit: number, secrets?: SecretRedactor): string => workTextResult(value, limit, secrets).text;
const nullableWorkText = (value: unknown, limit: number, secrets?: SecretRedactor) => typeof value === "string" ? workText(value, limit, secrets) : null;

export const validId = (value: unknown): value is string => hermesV2IdSchema.safeParse(value).success;
const nonnegative = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const integer = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) ? value : null;
const count = (value: unknown) => nonnegative(value) !== null && integer(value) !== null ? value as number : null;
const status = (value: unknown) => hermesV2WorkStatusSchema.safeParse(value).success ? value as HermesV2WorkSubagent["status"] : null;
export function workTextTruncated(value: unknown, secrets?: SecretRedactor): boolean {
  const row = object(value);
  for (const [key, limit] of [["goal", 10_000], ["model", 200], ["last_tool", 200], ["tool_name", 200], ["error", 4_000], ["command", 4_000], ["text", 200_000]] as const)
    if (typeof row[key] === "string" && (row[key].length > limit || workTextResult(row[key], limit, secrets).truncated)) return true;
  const output = row.output_tail ?? row.output_preview;
  return typeof output === "string" && (Buffer.byteLength(output) > 16_384 || boundedOutputResult(output, secrets).truncated);
}
export function boundedOutputResult(value: unknown, secrets?: SecretRedactor): { text: string; truncated: boolean } {
  if (typeof value !== "string") return { text: "", truncated: false };
  const masked = secrets?.bounded(value, 16_384, true) ?? { text: value, truncated: false };
  const bytes = Buffer.from(text(masked.text, Number.MAX_SAFE_INTEGER), "utf8");
  return { text: bytes.subarray(0, 16_384).toString("utf8").replace(/\uFFFD$/u, ""), truncated: masked.truncated || bytes.length > 16_384 };
}
export const boundedOutput = (value: unknown, secrets?: SecretRedactor) => boundedOutputResult(value, secrets).text;
export const emptySubagent = (id: string): HermesV2WorkSubagent => ({ kind: "subagent", id,
  parentId: null, depth: null, delegationId: null, goal: null, model: null, startedAt: null,
  status: null, toolCount: null, lastTool: null, acceptingSteer: null, durationMs: null });
export const emptyDelegation = (delegationId: string, taskIndex: number): HermesV2WorkDelegation => ({
  kind: "delegation", delegationId, taskIndex, status: null, goal: null, error: null, dispatchedAt: null, completedAt: null });
export function normalizeWorkSubagent(value: unknown, secrets?: SecretRedactor): HermesV2WorkSubagent | null {
  const row = object(value);
  if (!validId(row.subagent_id)) return null;
  return { ...emptySubagent(row.subagent_id), parentId: validId(row.parent_id) ? row.parent_id : null,
    depth: count(row.depth), delegationId: validId(row.delegation_id) ? row.delegation_id : null,
    goal: nullableWorkText(row.goal, 10_000, secrets), model: nullableWorkText(row.model, 200, secrets), startedAt: timestamp(row.started_at),
    status: status(row.status), toolCount: count(row.tool_count), lastTool: nullableWorkText(row.last_tool ?? row.tool_name, 200, secrets),
    acceptingSteer: typeof row.accepting_steer === "boolean" ? row.accepting_steer : null,
    durationMs: nonnegative(row.duration_seconds) === null ? null : (row.duration_seconds as number) * 1_000 };
}
export function normalizeWorkDelegation(value: unknown, secrets?: SecretRedactor): HermesV2WorkDelegation | null {
  const row = object(value);
  if (!validId(row.delegation_id) || count(row.task_index) === null) return null;
  return { ...emptyDelegation(row.delegation_id, row.task_index as number), status: nullableText(row.status, 100),
    goal: nullableWorkText(row.goal, 10_000, secrets), error: nullableWorkText(row.error, 4_000, secrets),
    dispatchedAt: timestamp(row.dispatched_at), completedAt: timestamp(row.completed_at) };
}
export function normalizeWorkProcess(value: unknown, secrets?: SecretRedactor): HermesV2WorkProcess | null {
  const row = object(value);
  if (!validId(row.session_id)) return null;
  const parsed = typeof row.started_at === "string" ? Date.parse(row.started_at) : NaN;
  return { kind: "process", id: row.session_id, command: nullableWorkText(row.command, 4_000, secrets), status: nullableText(row.status, 100),
    startedAt: Number.isFinite(parsed) && parsed >= 0 ? parsed : timestamp(row.started_at),
    uptimeSeconds: nonnegative(row.uptime_seconds), output: boundedOutput(row.output_tail ?? row.output_preview, secrets), exitCode: integer(row.exit_code) };
}
export function normalizeWorkPatch(event: UpstreamEvent, secrets?: SecretRedactor): HermesV2WorkPatch | null {
  const row = event.payload ?? {};
  if (event.type === "background.complete" || event.type === "btw.complete") {
    return validId(row.task_id) ? { kind: event.type === "btw.complete" ? "btw" : "background",
      id: row.task_id, status: "completed", text: workText(row.text, 200_000, secrets) } : null;
  }
  if (!/^subagent\.(spawn_requested|start|progress|thinking|tool|complete)$/.test(event.type)) return null;
  if (!validId(row.subagent_id)) {
    const delegation = normalizeWorkDelegation(row, secrets);
    if (!delegation) return null;
    const change: HermesV2WorkPatch = { kind: "delegation", delegationId: delegation.delegationId, taskIndex: delegation.taskIndex };
    for (const [wire, key] of [["goal", "goal"], ["status", "status"], ["error", "error"],
      ["dispatched_at", "dispatchedAt"], ["completed_at", "completedAt"]] as const)
      if (Object.hasOwn(row, wire)) Object.assign(change, { [key]: delegation[key] });
    if (!Object.hasOwn(row, "status") && event.type === "subagent.spawn_requested") change.status = "queued";
    if (!Object.hasOwn(row, "status") && event.type === "subagent.start") change.status = "running";
    return change;
  }
  const agent = normalizeWorkSubagent(row, secrets)!;
  const change: HermesV2WorkPatch = { kind: "subagent", id: agent.id };
  const fields = [["parent_id", "parentId"], ["depth", "depth"], ["delegation_id", "delegationId"], ["goal", "goal"],
    ["model", "model"], ["started_at", "startedAt"], ["status", "status"], ["tool_count", "toolCount"],
    ["last_tool", "lastTool"], ["accepting_steer", "acceptingSteer"], ["duration_seconds", "durationMs"]] as const;
  for (const [wire, key] of fields) if (Object.hasOwn(row, wire)) Object.assign(change, { [key]: agent[key] });
  if (!Object.hasOwn(row, "last_tool") && Object.hasOwn(row, "tool_name")) change.lastTool = agent.lastTool;
  if (!Object.hasOwn(row, "status") && event.type === "subagent.spawn_requested") change.status = "queued";
  if (!Object.hasOwn(row, "status") && event.type === "subagent.start") change.status = "running";
  if (!Object.hasOwn(row, "status") && event.type === "subagent.complete") change.status = null;
  return change;
}
