import type { ChatRuntime } from "./chat-runtime";
import type { OwnerCapture, OwnerRecord } from "./chat-owners";
import { ChatError } from "./gateway-protocol";

export interface WorkCapture {
  owner: OwnerCapture; version: number; sessionId: string; epoch: string | null; snapshot: number;
  socket: number; subscription: number; connection: string | null; cwd: string | null; cwdRevision: number;
}
export class ChatWorkContext {
  private versions = new WeakMap<OwnerRecord, number>();
  constructor(private readonly runtime: ChatRuntime) {}
  invalidate(owner: OwnerRecord): void { this.versions.set(owner, (this.versions.get(owner) ?? 0) + 1); }
  ready(owner: OwnerCapture, write = false): void {
    this.runtime.owners.assert(owner);
    const state = owner.sessionId ? this.runtime.store.peek(owner.sessionId) : null;
    if (!this.runtime.enabled() || owner.owner.options.active === false || owner.owner.options.visible === false
      || (typeof document !== "undefined" && document.visibilityState === "hidden")) throw new ChatError("OWNER_HIDDEN", "Diese Hermes-Fläche ist nicht sichtbar.");
    if (!state || state.loading || !this.runtime.sessionIsSynced(owner.sessionId!) || this.runtime.client.getSnapshot().state !== "online"
      || (write && !state.writable)) throw new ChatError("SESSION_UNAVAILABLE", "Die Sitzung ist für diese Aktion nicht bereit.");
  }
  capture(id: string, write = false): WorkCapture {
    const owner = this.runtime.owners.capture(id);
    this.ready(owner, write);
    const state = this.runtime.store.get(owner.sessionId!);
    return { owner, version: this.versions.get(owner.owner) ?? 0, sessionId: owner.sessionId!, epoch: state.epoch, snapshot: state.generation,
      socket: this.runtime.client.generation, subscription: this.runtime.sessionSubscription(owner.sessionId!),
      connection: this.runtime.client.getComposerBinding()?.id ?? null, cwd: state.session?.cwd ?? null, cwdRevision: state.cwdRevision };
  }
  valid(capture: WorkCapture): boolean {
    try { this.assert(capture); return true; } catch { return false; }
  }
  assert(capture: WorkCapture, write = false): void {
    this.ready(capture.owner, write);
    const state = this.runtime.store.peek(capture.sessionId);
    if ((this.versions.get(capture.owner.owner) ?? 0) !== capture.version || this.runtime.client.generation !== capture.socket
      || this.runtime.sessionSubscription(capture.sessionId) !== capture.subscription || state?.generation !== capture.snapshot
      || state.epoch !== capture.epoch || state.session?.cwd !== capture.cwd || state.cwdRevision !== capture.cwdRevision
      || (this.runtime.client.getComposerBinding()?.id ?? null) !== capture.connection) throw new ChatError("STALE_READ", "Der Aufgaben-Kontext wurde inzwischen geändert.");
  }
}
