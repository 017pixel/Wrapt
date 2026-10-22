import type { ResourceRuntime } from "./resource-runtime";
import type { ResourceData, ResourceSlot } from "./resource-state";
import type { ResourceCapture } from "./resource-context";
import { ResourceFailure, resourceError } from "./resource-error";
import { ResourceReadQueue } from "./resource-read-queue";
import { resourcePolicy } from "./resource-policy";

interface OpenRead {
  controller: AbortController;
  capture: ResourceCapture;
  promise: Promise<boolean>;
  dirty: boolean;
  followedUp: boolean;
}
export class ResourceReads {
  private open = new Map<ResourceSlot, OpenRead>();
  private fresh = new Map<string, { slot: ResourceSlot; capture: ResourceCapture; promise: Promise<boolean> }>();
  private queue = new ResourceReadQueue();
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly versions = new Map<ResourceSlot, number>();
  constructor(private readonly runtime: ResourceRuntime) {}
  async refresh(): Promise<void> {
    if (!this.runtime.context.visible()) return;
    const area = this.runtime.context.options?.area;
    if (area === "cron") {
      await this.read("cronList");
      if (this.runtime.state.selectedCron) await Promise.all([this.read("cronDetail"), this.read("cronRuns")]);
    } else if (area === "skills") {
      await Promise.all([this.read("skills"), this.read("pending")]);
      if (this.runtime.state.selectedSkill) await this.read("skillDetail");
    } else if (area === "memory") await Promise.all([this.read("memory"), this.read("pending")]);
    else if (area === "diagnostics") await this.read("diagnostics");
    else if (area === "session-delete" && this.runtime.context.options?.deleteSessionId) await this.read("sessionDeletion");
  }
  allowed(slot: ResourceSlot): boolean {
    if (!this.runtime.context.visible()) return false;
    const area = this.runtime.context.options!.area;
    return slot === "cronList" ? area === "cron"
      : slot === "cronDetail" || slot === "cronRuns" ? area === "cron" && this.runtime.state.selectedCron !== null
      : slot === "skills" ? area === "skills"
      : slot === "skillDetail" ? area === "skills" && this.runtime.state.selectedSkill !== null
      : slot === "pending" ? area === "memory" || area === "skills"
      : slot === "sessionDeletion" ? area === "session-delete" && !!this.runtime.context.options!.deleteSessionId
      : area === slot;
  }
  read<K extends ResourceSlot>(slot: K): Promise<boolean> {
    if (!this.allowed(slot)) return Promise.resolve(false);
    const existing = this.open.get(slot);
    if (existing) { if (!existing.followedUp) existing.dirty = true; return existing.promise; }
    const capture = this.runtime.context.capture();
    const controller = new AbortController();
    let resolve: (value: boolean) => void = () => {};
    const promise = new Promise<boolean>((done) => { resolve = done; });
    const entry: OpenRead = { capture, controller, promise, dirty: false, followedUp: false };
    // Reservierung vor jedem Emit verhindert reentrante Doppelreads.
    this.open.set(slot, entry);
    void this.execute(slot, entry).then(resolve);
    return promise;
  }
  readFresh(slot: ResourceSlot, actionKey: string): Promise<boolean> {
    if (!this.allowed(slot)) return Promise.resolve(false);
    const existing = this.fresh.get(actionKey);
    if (existing && existing.slot === slot && this.runtime.context.valid(existing.capture)) return existing.promise;
    if (this.fresh.size >= resourcePolicy.actions) {
      this.runtime.state.error = resourceError(new ResourceFailure("CLIENT_BUSY", "Zu viele bewusste Ressourcenabgleiche sind offen."));
      this.runtime.emit();
      return Promise.resolve(false);
    }
    const capture = this.runtime.context.capture();
    const previous = this.open.get(slot)?.promise;
    // Vor dem bewussten Abgleich begonnene Reads sind kein Frischebeleg.
    // Der Microtask reserviert auch reentrante/doppelte Abgleiche vor dem ersten Emit.
    const entry = { slot, capture, promise: Promise.resolve(false) };
    entry.promise = Promise.resolve().then(async () => {
      if (previous) await previous;
      if (!this.allowed(slot) || !this.runtime.context.valid(capture) || this.runtime.context.scope !== capture.scope) return false;
      return this.read(slot);
    }).finally(() => { if (this.fresh.get(actionKey) === entry) this.fresh.delete(actionKey); });
    this.fresh.set(actionKey, entry);
    return entry.promise;
  }
  private async execute<K extends ResourceSlot>(slot: K, entry: OpenRead): Promise<boolean> {
    let success: boolean;
    try {
      do {
        entry.dirty = false;
        if (!this.allowed(slot) || !this.runtime.context.valid(entry.capture)) return false;
        const old = this.runtime.state.reads[slot];
        this.runtime.state.set(slot, { status: "loading", data: old.data, stale: old.data !== null, error: null });
        this.runtime.actions.invalidateConfirmations(slot);
        this.runtime.emit();
        try {
          const result = await this.queue.run(entry.controller.signal, () => this.fetch(slot, entry.controller.signal));
          if (!this.runtime.context.valid(entry.capture) || entry.controller.signal.aborted || this.open.get(slot) !== entry) return false;
          if (!this.runtime.acceptScope(result.scope)) return false;
          this.versions.set(slot, (this.versions.get(slot) ?? 0) + 1);
          this.runtime.state.set(slot, { status: "ready", data: result, stale: false, error: null });
          success = true;
        } catch (error) {
          if (!this.runtime.context.valid(entry.capture) || entry.controller.signal.aborted || this.open.get(slot) !== entry) return false;
          const info = resourceError(error);
          const missing = info.status === 404 && info.code === "TARGET_UNAVAILABLE";
          this.runtime.state.set(slot, { status: missing ? "missing" : "error", data: null, stale: false, error: info });
          success = missing;
        }
        this.runtime.emit();
        if (entry.dirty) entry.followedUp = true;
      } while (entry.dirty);
      return success;
    } finally {
      if (this.open.get(slot) === entry) this.open.delete(slot);
    }
  }
  private async fetch<K extends ResourceSlot>(slot: K, signal: AbortSignal): Promise<ResourceData[K]> {
    const { client, state, context } = this.runtime;
    const result = slot === "cronList" ? await client.cronList(signal)
      : slot === "cronDetail" ? await client.cronDetail(state.selectedCron!, signal)
      : slot === "cronRuns" ? await client.cronRuns(state.selectedCron!, signal)
      : slot === "skills" ? await client.skills(signal)
      : slot === "skillDetail" ? await client.skillDetail(state.selectedSkill!, signal)
      : slot === "memory" ? await client.memory(signal)
      : slot === "pending" ? await client.pending(signal)
      : slot === "diagnostics" ? await client.diagnostics(signal)
      : await client.sessionPreview(context.options!.deleteSessionId!, signal);
    return result as ResourceData[K];
  }
  invalidate(slots: readonly ResourceSlot[]): void {
    for (const slot of slots) {
      const entry = this.open.get(slot);
      entry?.controller.abort();
      this.open.delete(slot);
      const old = this.runtime.state.reads[slot];
      this.runtime.state.set(slot, { ...old, stale: true });
      this.runtime.actions.invalidateConfirmations(slot);
    }
    this.runtime.emit();
    if (!this.runtime.context.visible() || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      for (const slot of slots) if (this.allowed(slot)) void this.read(slot);
    }, resourcePolicy.invalidationMs);
  }
  abortAll(): void {
    for (const entry of this.open.values()) entry.controller.abort();
    this.open.clear();
    this.fresh.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
