import { hermesV2IdSchema, type HermesV2SessionDeleted, type HermesV2SessionDeletionPreview } from "@wrapt/contracts/hermes-v2";
import { activeSchema, parse, replaySchema } from "../upstream-schemas.js";
import { object } from "../normalize-values.js";
import type { ResourceHost, ResourceMutation } from "./host.js";
import type { ResourceContext } from "./context.js";
import { ResourceError } from "./errors.js";
import { resourceText } from "./projection.js";
import { captureDeleteCleanup, recordIdle } from "./delete-cleanup.js";

const reserved = new Set(["empty", "bulk", "bulk-delete", "search", "stats", "owner-backfill"]);
export function sessionDeleteId(value: unknown): string {
  const id = hermesV2IdSchema.parse(value);
  if (reserved.has(id.toLowerCase())) throw new ResourceError(400, "INVALID_RESOURCE_REQUEST", "Diese native Routenkennung ist keine löschbare Sitzungs-ID.");
  return id;
}
async function detail(host: ResourceHost, binding: ResourceContext, id: string) {
  const raw = object(await host.read(binding, host.path(binding, `/api/sessions/${encodeURIComponent(id)}`)));
  if (raw.id !== id || raw.profile !== binding.scope.profile) throw new ResourceError(404, "TARGET_UNAVAILABLE", "Die genaue volle Sitzung ist im bestätigten Profil nicht verfügbar.");
  return raw;
}
function localIdle(host: ResourceHost): boolean {
  return host.pool.existing().every((manager) => [...manager.sessions.records.values()].every((record) => recordIdle(manager, record)) && !manager.sessions.protection.active);
}
/** Kein Attach/Resume. Bei unvollständigem Laufzeitbeleg bleibt die ganze native Kaskade geschützt. */
async function idleProof(host: ResourceHost, binding: ResourceContext, owner: string) {
  const manager = host.pool.peek(owner);
  if (!manager || manager.upstream.state !== "online" || !manager.upstream.transportId) return null;
  const transport = manager.upstream.transportId; const epoch = manager.upstream.epoch;
  const guard = () => {
    binding.assert();
    if (manager.upstream.transportId !== transport || manager.upstream.epoch !== epoch || manager.upstream.state !== "online" || !localIdle(host))
      throw new ResourceError(409, "NATIVE_CONFLICT", "Der Laufzeitbeleg ist nicht mehr sicher inaktiv.");
  };
  if (!localIdle(host)) return null;
  try {
    const active = parse(activeSchema, await manager.upstream.call("session.active_list", {})); await binding.current(); guard();
    for (const entry of active.sessions) {
      if (entry.status !== "idle") return null;
      const record = [...host.pool.existing()].flatMap((current) => [...current.sessions.records.values()]).find((row) => row.canonicalId === entry.session_key && row.liveId === entry.id && row.epoch === epoch && row.profileName === binding.scope.profile);
      if (!record) return null;
      const replay = parse(replaySchema, await manager.upstream.call("session.events.since", { session_id: entry.id, last_seen: record.seq }));
      await binding.current(); guard();
      if (replay.epoch !== epoch || replay.open_requests.length || replay.latest_seq !== record.seq) return null;
    }
    return { manager, guard };
  } catch { await binding.current(); return null; }
}
const identity = (row: Record<string, unknown>) => JSON.stringify([row.id, row.profile, row.cwd, row.started_at, row.parent_session_id]);
export async function deletionPreview(host: ResourceHost, binding: ResourceContext, owner: string, id: string): Promise<HermesV2SessionDeletionPreview> {
  const row = await detail(host, binding, id);
  let reason: string | null = null;
  try {
    if (typeof row.cwd !== "string") throw new Error();
    await binding.cwd(row.cwd);
    if (row.scheduler_owned === true || row.running === true || !await idleProof(host, binding, owner)) reason = "Laufende Arbeit, offene Anfragen oder ein unbekannter Laufzeitbeleg schützen die native Löschkaskade.";
  } catch { await binding.current(); reason = "Arbeitsordner oder Laufzeitbeleg sind nicht sicher bestätigt."; }
  return { scope: reason === null ? host.deletions.issue(owner, id, binding.token, identity(row)) : binding.token, requestedSessionId: id, title: resourceText(host.secrets, row.title, 200).text,
    deletable: reason === null, reason, effect: "compression-chain" };
}
export async function deleteSession(host: ResourceHost, binding: ResourceContext, mutation: ResourceMutation, owner: string, id: string, expectedIdentity: string): Promise<{ result: HermesV2SessionDeleted; cleanup(): void }> {
  const row = await detail(host, binding, id);
  if (identity(row) !== expectedIdentity) throw new ResourceError(409, "STALE_RESOURCE_CONTEXT", "Die genaue Sitzung hat sich seit der Vorschau geändert.");
  if (typeof row.cwd !== "string" || row.scheduler_owned === true || row.running === true) throw new ResourceError(409, "NATIVE_CONFLICT", "Die Sitzung ist nicht sicher inaktiv.");
  const cwd = await binding.cwd(row.cwd); const proof = await idleProof(host, binding, owner);
  if (!proof) throw new ResourceError(409, "NATIVE_CONFLICT", "Die native Löschkaskade hat keinen vollständigen Inaktivitätsbeleg.");
  await cwd.current(); proof.guard();
  let cleanup = () => {};
  const ack = object(await mutation.send(host, binding, "delete", host.path(binding, `/api/sessions/${encodeURIComponent(id)}`), undefined, async () => {
    await cwd.current(); proof.guard(); cleanup = captureDeleteCleanup(host, binding.scope.profile, id);
  }));
  if (ack.ok !== true || ack.already_absent !== undefined && typeof ack.already_absent !== "boolean") throw new ResourceError(503, "UNKNOWN_OUTCOME", "Die native Löschquittung ist nicht bestätigt.");
  let absent: boolean;
  try { const after = object(await host.read(binding, host.path(binding, `/api/sessions/${encodeURIComponent(id)}`))); absent = typeof after.id === "string" && after.id !== id; }
  catch (error) { if (error instanceof ResourceError && error.status === 404) absent = true; else throw error; }
  await cwd.current();
  if (!absent) throw new ResourceError(503, "UNKNOWN_OUTCOME", "Die angefragte Sitzung ist nach der Quittung nicht bestätigt abwesend.");
  return { result: { scope: binding.token, outcome: "confirmed", requestedSessionId: id, alreadyAbsent: ack.already_absent === true,
    confirmedAbsentSessionIds: [id], affectedIdsComplete: false, effect: "compression-chain" }, cleanup };
}
