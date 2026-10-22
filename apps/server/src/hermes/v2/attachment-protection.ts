import { randomUUID } from "node:crypto";
import { hermesV2IdSchema } from "@wrapt/contracts/hermes-v2";
import { z } from "zod";
import { GatewayError } from "./errors.js";
import { object } from "./normalize-values.js";
import { activeSchema, parse, replaySchema } from "./upstream-schemas.js";
import type { GatewayUpstream } from "./upstream.js";
import type { UpstreamEvent } from "./types.js";

interface Hold { epoch: string | null; canonicalId: string | null; liveId: string | null }
const finished = new Set(["completed", "complete", "success", "failed", "interrupted", "cancelled", "exited", "killed", "finished", "stopped", "terminated"]);
const nullableId = (value: unknown) => { const parsed = hermesV2IdSchema.safeParse(value); return parsed.success ? parsed.data : null; };

/** Ein fehlerhaft bestätigter Attach darf keine möglicherweise fremde Runtime durch Disconnect beenden. */
export class AttachmentProtection {
  private readonly holds = new Map<string, Hold>();
  private resyncing: Promise<void> | null = null;
  private dirty = false;
  private disposed = false;

  constructor(private readonly upstream: GatewayUpstream, private readonly limit: number, private readonly onChange: () => void, private readonly onSettled: (hold: Hold) => void) {}

  get active(): boolean { return this.holds.size > 0; }

  reserve(canonicalId: string | null): string {
    if (this.holds.size >= this.limit) throw new GatewayError("RATE_LIMITED", "Zu viele ungeklärte Hermes-Anbindungen.");
    const key = randomUUID();
    this.holds.set(key, { canonicalId, liveId: null, epoch: this.upstream.epoch });
    return key;
  }

  observe(key: string, value: unknown): void {
    const hold = this.holds.get(key);
    if (!hold) return;
    const raw = object(value);
    hold.liveId = nullableId(raw.session_id);
    hold.canonicalId ??= nullableId(raw.stored_session_id ?? raw.session_key ?? raw.resumed);
  }

  release(key: string): void { this.holds.delete(key); }

  holdKnown(canonicalId: string, liveId: string | null, epoch: string): void {
    if (![...this.holds.values()].some((hold) => hold.canonicalId === canonicalId && hold.liveId === liveId && hold.epoch === epoch)
      && this.holds.size < this.limit) this.holds.set(randomUUID(), { canonicalId, liveId, epoch });
    this.resync();
  }

  onEvent(event: UpstreamEvent): void {
    if (["sessions.changed", "message.complete", "error", "request.cancel", "session.info", "background.complete", "btw.complete"].includes(event.type) || event.type.startsWith("subagent.")) this.resync();
  }

  resync(): void {
    if (this.disposed || !this.active || !this.upstream.canReadLifecycle) return;
    if (this.resyncing) { this.dirty = true; return; }
    this.resyncing = this.check().catch(() => { /* Unbelegte Zustände bleiben geschützt, ohne Pollschleife. */ }).finally(() => {
      this.resyncing = null;
      if (this.dirty) { this.dirty = false; this.resync(); }
    });
  }

  dispose(): void { this.disposed = true; this.holds.clear(); }

  private async check(): Promise<void> {
    const transport = this.upstream.transportId;
    const epoch = this.upstream.epoch;
    const active = parse(activeSchema, await this.upstream.call("session.active_list", {}));
    for (const [key, hold] of this.holds) {
      if (hold.epoch !== epoch || this.disposed) continue;
      const matches = active.sessions.filter((row) => hold.canonicalId ? row.session_key === hold.canonicalId : hold.liveId !== null && row.id === hold.liveId);
      if (matches.length !== 1) continue;
      const row = matches[0]!;
      if (hold.liveId && hold.liveId !== row.id) continue;
      hold.liveId = row.id;
      if (row.status !== "idle") continue;
      const before = parse(replaySchema, await this.upstream.call("session.events.since", { session_id: row.id, last_seen: 0 }));
      if (before.epoch !== epoch || before.open_requests.length) continue;
      const agents = parse(z.object({ subagents: z.array(z.unknown()).max(100) }), await this.upstream.call("subagent.list", { session_id: row.id }));
      const processes = parse(z.object({ processes: z.array(z.unknown()).max(100) }), await this.upstream.call("process.list", { session_id: row.id }));
      if ([...agents.subagents, ...processes.processes].some((entry) => !finished.has(String(object(entry).status)))) continue;
      const after = parse(replaySchema, await this.upstream.call("session.events.since", { session_id: row.id, last_seen: before.latest_seq }));
      const now = parse(activeSchema, await this.upstream.call("session.active_list", {}));
      if (this.disposed || this.upstream.transportId !== transport || this.upstream.epoch !== epoch || after.epoch !== epoch
        || after.latest_seq !== before.latest_seq || after.open_requests.length) continue;
      const settled = now.sessions.filter((entry) => entry.id === row.id && entry.session_key === row.session_key);
      if (settled.length === 1 && settled[0]!.status === "idle") {
        this.holds.delete(key);
        this.onSettled(hold);
      }
    }
    if (!this.disposed) this.onChange();
  }
}
