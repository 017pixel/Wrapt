import type { HermesV2Event, HermesV2Snapshot } from "@wrapt/contracts/hermes-v2";
import type { GatewayManager } from "./manager.js";
import type { SessionRecord, UpstreamRequest } from "./types.js";
import { GatewayError, protocolError } from "./errors.js";
import { parse, replaySchema } from "./upstream-schemas.js";

/** Anfrageabgleich und offene Nativeanfragen teilen dieselbe Registry-Lebensdauer. */
export class GatewayRequestLifecycle {
  constructor(private manager: GatewayManager, private authority: string,
    private emit: (event: HermesV2Event, record: SessionRecord) => void,
    private attention: (record: SessionRecord, event: string) => void, private onUnused: () => void) {}
  context(record: SessionRecord, connectionId: string, epoch: string) {
    const manager = this.manager;
    if (epoch !== record.epoch || !record.liveId || !manager.upstream.transportId || !manager.connections.has(connectionId) || !record.subscribers.has(connectionId)) throw new GatewayError("STALE_REQUEST", "Diese Anfrage gehört nicht mehr zur aktiven Verbindung.");
    return { origin: this.authority, principal: manager.principal, liveId: record.liveId, epoch, sessionId: record.storedId, connectionId, transportId: manager.upstream.transportId };
  }
  async sync(record: SessionRecord): Promise<void> {
    if (!record.liveId) return;
    const manager = this.manager; const transportId = manager.upstream.transportId;
    const liveId = record.liveId; const epoch = record.epoch;
    const replay = parse(replaySchema, await manager.upstream.call("session.events.since", { session_id: liveId, last_seen: record.seq }));
    if (!transportId || manager.upstream.transportId !== transportId || manager.upstream.state !== "online" || record.liveId !== liveId || record.epoch !== epoch) throw new GatewayError("SESSION_UNAVAILABLE", "Der Anfrageabgleich wurde unterbrochen.", "not_sent", true);
    if (replay.epoch !== epoch) throw protocolError();
    manager.registry.reconcile(this.authority, epoch, liveId, replay.open_requests.map((request) => request.id), transportId);
    record.snapshot.requests = [];
    for (const request of replay.open_requests) this.observe(record, request, false);
    manager.sessions.protection.resync();
  }
  observe(record: SessionRecord, raw: UpstreamRequest, broadcast: boolean): void {
    if (!record.liveId) return;
    const manager = this.manager;
    let request: HermesV2Snapshot["requests"][number] | null = null;
    for (const connectionId of [...record.subscribers, `runtime:${manager.principal}`]) {
      request = manager.registry.observe(raw, { origin: this.authority, principal: manager.principal, liveId: record.liveId, epoch: record.epoch, sessionId: record.storedId, connectionId, transportId: manager.upstream.transportId ?? "offline" }, (key) => {
        if (!record.snapshot.requests.some((entry) => entry.key === key)) return;
        record.snapshot.requests = record.snapshot.requests.filter((entry) => entry.key !== key);
        this.emit({ sessionId: record.storedId, epoch: record.epoch, seq: null, type: "request.closed", payload: { requestKey: key, reason: "settled" } }, record);
        if (manager.connections.size === 0) this.onUnused();
      });
    }
    if (!request) { void manager.upstream.respond(raw.id, null).catch(() => manager.upstream.protocolFault()); return; }
    const index = record.snapshot.requests.findIndex((entry) => entry.key === request!.key);
    if (index < 0) record.snapshot.requests.push(request);
    else record.snapshot.requests[index] = request;
    if (broadcast) {
      this.emit({ sessionId: record.storedId, epoch: record.epoch, seq: null, type: "request.opened", payload: request }, record);
      this.attention(record, `request:${record.epoch}:${record.liveId}:${raw.id}`);
    }
  }
}
