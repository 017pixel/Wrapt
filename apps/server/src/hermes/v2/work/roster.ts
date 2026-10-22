import { z } from "zod";
import type { GatewayUpstream } from "../upstream.js";
import { parse } from "../upstream-schemas.js";
import type { SecretRedactor } from "../secret-redactor.js";
import { normalizeWorkDelegation, normalizeWorkProcess, normalizeWorkSubagent, workTextTruncated } from "./normalize.js";

/** Native Sessionlisten bleiben die Autorität; Beobachtungen ersetzen keine Zielautorisierung. */
export async function readNativeRoster(upstream: GatewayUpstream, live: string, limit: number, secrets?: SecretRedactor) {
  const [agents, background] = await Promise.all([
    upstream.call("subagent.list", { session_id: live }), upstream.call("process.list", { session_id: live }),
  ]);
  const children = parse(z.object({ subagents: z.array(z.unknown()), delegations: z.array(z.unknown()).optional() }), agents);
  const processes = parse(z.object({ processes: z.array(z.unknown()) }), background);
  const subagents = children.subagents.slice(0, limit).flatMap((entry) => { const row = normalizeWorkSubagent(entry, secrets); return row ? [row] : []; });
  const delegations = (children.delegations ?? []).slice(0, limit).flatMap((entry) => { const row = normalizeWorkDelegation(entry, secrets); return row ? [row] : []; });
  const rows = processes.processes.slice(0, limit).flatMap((entry) => { const row = normalizeWorkProcess(entry, secrets); return row ? [row] : []; });
  return { subagents, delegations, processes: rows, truncated: children.subagents.length > limit || (children.delegations?.length ?? 0) > limit
    || processes.processes.length > limit || subagents.length !== Math.min(limit, children.subagents.length)
    || delegations.length !== Math.min(limit, children.delegations?.length ?? 0) || rows.length !== Math.min(limit, processes.processes.length)
    || [...children.subagents.slice(0, limit), ...(children.delegations ?? []).slice(0, limit), ...processes.processes.slice(0, limit)]
      .some((row) => workTextTruncated(row, secrets)) };
}
