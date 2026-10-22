import type { GatewayManager } from "../manager.js";
import type { SessionRecord } from "../types.js";
import type { ResourceHost } from "./host.js";

export function recordIdle(manager: GatewayManager, record: SessionRecord): boolean {
  return !manager.sessions.protection.active && !record.hydrating && record.buffered.length === 0 && record.bufferedBytes === 0
    && record.snapshot.running === false && record.snapshot.queuedText === null && record.snapshot.requests.length === 0
    && record.backgroundActive === false && !record.backgroundProtected && !manager.work.state.active(record);
}
/** Nur die unmittelbar vor dem nativen Send belegten lokalen Bindungen aufräumen. */
export function captureDeleteCleanup(host: ResourceHost, profile: string, id: string): () => void {
  const records = host.pool.existing().flatMap((manager) => [...manager.sessions.records.entries()].flatMap(([key, record]) => {
    if (record.storedId !== id || record.profileName !== profile || !recordIdle(manager, record)) return [];
    return [{ manager, key, record, snapshot: record.snapshot, requests: record.snapshot.requests,
      epoch: record.epoch, liveId: record.liveId, canonicalId: record.canonicalId, transport: manager.upstream.transportId,
      hydration: record.hydrationRevision, context: record.contextRevision, seq: record.seq, turn: record.turnId,
      work: manager.work.state.get(record).revision,
      leases: [...record.subscribers].map((connection) => ({ id: connection, connection: manager.connections.get(connection), generation: manager.subscriptions.get(connection, key) })) }];
  }));
  return () => {
    for (const before of records) {
      const { manager, record, key } = before;
      if (host.pool.peek(manager.principal) !== manager || manager.sessions.records.get(key) !== record || !recordIdle(manager, record)
        || record.profileName !== profile || record.storedId !== id || record.canonicalId !== before.canonicalId || record.liveId !== before.liveId
        || record.epoch !== before.epoch || manager.upstream.epoch !== before.epoch || manager.upstream.transportId !== before.transport
        || record.snapshot !== before.snapshot || record.snapshot.requests !== before.requests || record.seq !== before.seq || record.turnId !== before.turn
        || record.hydrationRevision !== before.hydration || record.contextRevision !== before.context || manager.work.state.get(record).revision !== before.work
        || record.subscribers.size !== before.leases.length || before.leases.some((lease) => !record.subscribers.has(lease.id)
          || manager.connections.get(lease.id) !== lease.connection || manager.subscriptions.get(lease.id, key) !== lease.generation)) continue;
      for (const lease of before.leases) { manager.subscriptions.detach(lease.id, key); manager.registry.detach(manager.principal, lease.id, key); }
      record.subscribers.clear(); manager.sessions.records.delete(key);
    }
  };
}
