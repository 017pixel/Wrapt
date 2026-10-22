import { GatewayError } from "./errors.js";
import type { GatewayManager } from "./manager.js";
import type { SessionRecord } from "./types.js";

/** Captures bleiben an genau dieselbe Browser- und Runtimeverbindung gebunden. */
export function createMutationGuard(manager: GatewayManager, active: () => boolean, connectionId: string, record?: SessionRecord): () => void {
  const connection = manager.connections.get(connectionId);
  const transportId = manager.upstream.transportId;
  const epoch = manager.upstream.epoch;
  const liveId = record?.liveId;
  return () => {
    if (!active() || !connection || manager.connections.get(connectionId) !== connection)
      throw new GatewayError("FORBIDDEN", "Diese Browser-Verbindung ist nicht mehr aktiv.");
    if (!transportId || manager.upstream.transportId !== transportId || manager.upstream.epoch !== epoch || manager.upstream.state !== "online")
      throw new GatewayError("SESSION_UNAVAILABLE", "Die Hermes-Verbindung hat sich geändert.", "not_sent", true);
    if (record && (manager.requireSession(record.storedId, connectionId) !== record || record.liveId !== liveId || record.epoch !== epoch || !record.snapshot.writable))
      throw new GatewayError("STALE_REQUEST", "Die aktive Sessionbindung hat sich geändert.");
  };
}

export class SubscriptionGenerations {
  private next = 0;
  private generations = new Map<string, number>();
  get(connection: string, session: string): number | undefined { return this.generations.get(`${connection}\0${session}`); }
  attach(connection: string, session: string): void {
    const key = `${connection}\0${session}`;
    if (!this.generations.has(key)) this.generations.set(key, ++this.next);
  }
  detach(connection: string, session?: string): void {
    for (const key of this.generations.keys()) if (session ? key === `${connection}\0${session}` : key.startsWith(`${connection}\0`)) this.generations.delete(key);
  }
}
