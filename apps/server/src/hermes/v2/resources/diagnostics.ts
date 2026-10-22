import type { HermesV2Diagnostics, HermesV2ResourceText } from "@wrapt/contracts/hermes-v2";
import { object } from "../normalize-values.js";
import type { ResourceContext } from "./context.js";
import type { ResourceHost } from "./host.js";
import { resourceText } from "./projection.js";

export async function diagnosticsRead(host: ResourceHost, binding: ResourceContext, owner: string): Promise<HermesV2Diagnostics> {
  let status: Record<string, unknown> = {}; let reachable = false;
  try { status = object(await host.read(binding, host.path(binding, "/api/status"))); reachable = true; }
  catch { await binding.current(); }
  let update: Record<string, unknown> = {};
  try { update = object(await host.deps.resources?.readUpdateStatus?.()); await binding.current(); }
  catch { await binding.current(); }
  const log = (value: unknown, known: boolean): HermesV2ResourceText => {
    if (!known) return { text: null, bytes: null, status: "unknown", truncated: false };
    const raw = Array.isArray(value) ? value.filter((row): row is string => typeof row === "string").join("\n") : typeof value === "string" ? value : "";
    const result = resourceText(host.secrets, raw, 16_384, true);
    return { text: result.text, bytes: Buffer.byteLength(raw), status: raw ? "available" : "empty", truncated: result.truncated || Array.isArray(value) && value.length > 100 };
  };
  let logs: HermesV2ResourceText;
  try { const raw = object(await host.read(binding, host.path(binding, "/api/logs?file=agent&lines=50"))); logs = log(raw.lines, Array.isArray(raw.lines)); }
  catch { await binding.current(); logs = log(null, false); }
  const tail = log(update.logTail, Array.isArray(update.logTail));
  let truncated = logs.truncated || tail.truncated;
  const display = (value: unknown, limit: number) => { if (typeof value !== "string") return null; const result = resourceText(host.secrets, value, limit); truncated ||= result.truncated; return result.text; };
  const manager = host.pool.peek(owner);
  return { scope: binding.token, connection: { state: manager?.upstream.state ?? "unavailable", epoch: manager?.upstream.epoch ?? null,
    subscriptions: manager ? [...manager.sessions.records.values()].reduce((sum, row) => sum + row.subscribers.size, 0) : 0, protectedRuntime: manager?.retainRuntime ?? false },
    dashboard: { reachable, version: display(status.version, 200), gatewayState: display(status.gateway_state ?? status.gateway_status, 200), error: display(status.gateway_exit_reason, 2000) },
    update: { phase: display(update.phase, 100), pending: typeof update.pending === "boolean" ? update.pending : null, lastResult: display(update.lastResult, 200), lastCheckedAt: display(update.lastCheckedAt, 100), logTail: tail },
    logs, truncated, adminPath: "/hermes" };
}
