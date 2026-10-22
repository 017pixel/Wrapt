import type { HermesV2Activity, HermesV2Session } from "@wrapt/contracts/hermes-v2";
import type { GatewayManager } from "../manager.js";
import { activeSchema, parse, replaySchema } from "../upstream-schemas.js";
import { object, timestamp } from "../normalize-values.js";
import type { OrganizationScope } from "./scope.js";
import { mapBounded, unknownActivity } from "./catalog.js";
import { organizationPolicy } from "./policy.js";

/** Read-only Beobachtung vorhandener Runtimes. Niemals aktivieren, übernehmen oder neu bauen. */
export async function readActivity(manager: GatewayManager | undefined, scope: OrganizationScope, sessions: readonly HermesV2Session[], now = Date.now()): Promise<Record<string, HermesV2Activity>> {
  const output = Object.fromEntries(sessions.map((session) => [session.id, unknownActivity(now)]));
  if (!manager?.connections.size || manager.upstream.state !== "online") return output;
  let active;
  try { active = parse(activeSchema, await manager.upstream.call("session.active_list", {})); }
  catch { return output; }
  let proofs = 0;
  await mapBounded(sessions, async (session) => {
    const candidates = active.sessions.filter((item) => item.session_key === session.id);
    if (candidates.length !== 1) return;
    const item = candidates[0]!;
    const known = manager.sessions.records.get(session.id);
    const states = { waiting: "waiting_input", working: "working", starting: "starting", idle: "idle" } as const;
    if (!(item.status in states)) return;
    const state = states[item.status as keyof typeof states];
    const bound = known?.profileName === scope.profile && known.liveId === item.id && known.epoch === manager.upstream.epoch;
    if (bound) {
      output[session.id] = { state, turnStartedAt: state === "idle" || known.hydrating ? null : known.snapshot.turnStartedAt,
        openRequestCount: known.hydrating ? null : known.snapshot.requests.length, subagentCount: null, backgroundCount: null,
        observedAt: now, coverage: known.hydrating ? "partial" : "observed" };
      return;
    }
    if (proofs++ >= organizationPolicy.activityProofs) return;
    try {
      const replay = parse(replaySchema, await manager.upstream.call("session.events.since", { session_id: item.id, last_seen: 0 }));
      if (replay.epoch !== manager.upstream.epoch) return;
      const info = replay.events.filter((event) => event.session_id === item.id && event.type === "session.info")
        .map((event) => object(event.payload)).at(-1);
      const witnessed = info?.profile_name === scope.profile && info.stored_session_id === session.id;
      if (!witnessed) return;
      output[session.id] = { state, turnStartedAt: state === "idle" ? null : timestamp(info?.turn_started_at),
        openRequestCount: replay.open_requests.length, subagentCount: null, backgroundCount: null, observedAt: now, coverage: "observed" };
    } catch { /* Fehlende Profile-/Runtimebeweise bleiben ausdrücklich unbekannt. */ }
  });
  return output;
}
