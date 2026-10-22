import { z } from "zod";
import { object } from "./normalize-values.js";
import { parse } from "./upstream-schemas.js";
import type { SessionRecord } from "./types.js";
import type { GatewayUpstream } from "./upstream.js";

const finished = new Set(["completed", "complete", "success", "failed", "error", "timeout", "interrupted", "cancelled", "exited", "killed", "finished", "stopped", "terminated"]);
const pending = new WeakMap<SessionRecord, Promise<void>>();
const observations = new WeakMap<SessionRecord, { issued: number; applied: number }>();
export function backgroundRowsActive(entries: readonly unknown[]): boolean {
  return entries.some((entry) => { const status = object(entry).status; return typeof status !== "string" || !finished.has(status); });
}

/** Lifecycle und Work teilen die Startreihenfolge ihrer bestätigten nativen Beobachtungen. */
export function beginBackgroundObservation(record: SessionRecord): (active: boolean, sideActive: boolean) => void {
  let state = observations.get(record);
  if (!state) { state = { issued: 0, applied: 0 }; observations.set(record, state); }
  const order = ++state.issued;
  return (active, sideActive) => {
    if (order <= state.applied) return;
    state.applied = order;
    record.backgroundProtected = active;
    record.backgroundActive = sideActive || active;
  };
}

/** Nur Lifecycle-Schutz: unbekannte Hintergrundzustände erlauben keine Entsorgung. */
export function refreshBackground(upstream: GatewayUpstream, record: SessionRecord, sideActive = () => false): Promise<void> {
  const existing = pending.get(record); if (existing) return existing;
  const request = readBackground(upstream, record, sideActive).finally(() => { if (pending.get(record) === request) pending.delete(record); });
  pending.set(record, request); return request;
}
async function readBackground(upstream: GatewayUpstream, record: SessionRecord, sideActive: () => boolean): Promise<void> {
  if (!record.liveId) return;
  const epoch = record.epoch;
  const live = record.liveId; const transport = upstream.transportId;
  const observe = beginBackgroundObservation(record);
  const [agents, processes] = await Promise.all([
    upstream.call("subagent.list", { session_id: record.liveId }),
    upstream.call("process.list", { session_id: record.liveId }),
  ]);
  const children = parse(z.object({ subagents: z.array(z.unknown()).max(100) }), agents).subagents;
  const background = parse(z.object({ processes: z.array(z.unknown()).max(100) }), processes).processes;
  if (record.epoch !== epoch || record.liveId !== live || upstream.transportId !== transport) return;
  observe(backgroundRowsActive([...children, ...background]), sideActive());
}
