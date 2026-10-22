import type { ChatRuntime } from "./chat-runtime";
import type { OwnerRecord } from "./chat-owners";
import type { ChatWorkContext, WorkCapture } from "./chat-work-context";
import { applyWorkRoster } from "./chat-work-state";
import { ChatError, errorInfo } from "./gateway-protocol";
import { chatPolicy } from "./chat-policy";

interface WorkRead { capture: WorkCapture; promise: Promise<void> }
export class ChatWorkReads {
  private reads = new Map<string, WorkRead>();
  private scheduled = new Map<string, ReturnType<typeof setTimeout>>();
  private dirty = new Set<string>();
  constructor(private readonly runtime: ChatRuntime, private readonly context: ChatWorkContext,
    private readonly emit: (id: string) => void) {}
  async refresh(ownerId: string): Promise<void> {
    let capture: WorkCapture;
    try { capture = this.context.capture(ownerId); }
    catch (error) {
      const owner = this.runtime.owners.records.get(ownerId);
      if (owner?.mounted) { this.runtime.owners.capture(ownerId).draft.error = errorInfo(error); this.runtime.owners.emit(owner); }
      return;
    }
    const running = this.reads.get(capture.sessionId);
    if (running) {
      if (!this.context.valid(running.capture)) this.dirty.add(capture.sessionId);
      return running.promise;
    }
    const timer = this.scheduled.get(capture.sessionId);
    if (timer) clearTimeout(timer);
    this.scheduled.delete(capture.sessionId);
    let release!: () => void;
    const entry: WorkRead = { capture, promise: new Promise<void>((resolve) => { release = resolve; }) };
    this.reads.set(capture.sessionId, entry);
    try {
      this.runtime.store.update(capture.sessionId, (state) => ({ ...state, work: { ...state.work, loading: true, error: null } }));
      this.emit(capture.sessionId);
      await this.load(capture);
    } finally {
      if (this.reads.get(capture.sessionId) === entry) {
        this.reads.delete(capture.sessionId);
        if (this.dirty.delete(capture.sessionId)) this.schedule(capture.sessionId);
      }
      release();
    }
  }
  schedule(id: string, immediate = false): void {
    if (this.scheduled.has(id) || !this.visibleOwner(id)) return;
    if (this.reads.has(id)) { this.dirty.add(id); return; }
    const timer = setTimeout(() => {
      this.scheduled.delete(id);
      const owner = this.visibleOwner(id);
      if (owner) void this.refresh(owner.id);
    }, immediate ? 0 : chatPolicy.workRefreshMs);
    this.scheduled.set(id, timer);
  }
  sync(): void {
    for (const [id, timer] of this.scheduled) if (!this.visibleOwner(id)) { clearTimeout(timer); this.scheduled.delete(id); }
    for (const owner of this.runtime.owners.records.values()) {
      if (owner.sessionId && !this.runtime.store.get(owner.sessionId).work.loaded) this.schedule(owner.sessionId, true);
    }
  }
  dispose(): void {
    for (const timer of this.scheduled.values()) clearTimeout(timer);
    this.scheduled.clear(); this.reads.clear(); this.dirty.clear();
  }
  private visibleOwner(id: string): OwnerRecord | null {
    for (const owner of this.runtime.owners.records.values()) {
      if (!owner.mounted || owner.sessionId !== id) continue;
      try { this.context.ready(this.runtime.owners.capture(owner.id)); return owner; } catch { /* anderer sichtbarer Owner möglich */ }
    }
    return null;
  }
  private async load(capture: WorkCapture): Promise<void> {
    try {
      const result = await this.runtime.read({ op: "work.read", sessionId: capture.sessionId }, () => this.context.valid(capture));
      this.context.assert(capture);
      const current = this.runtime.store.get(capture.sessionId).work;
      if (current.revision !== null && result.data.revision < current.revision) throw new ChatError("STALE_READ", "Neuere Aufgabenereignisse haben diesen Abgleich ersetzt.");
      this.runtime.work.actions.observe(capture.sessionId, result.data.tasks);
      this.runtime.store.update(capture.sessionId, (state) => ({ ...state, work: applyWorkRoster(state.work, result.data), queuedText: result.data.queuedText }));
    } catch (error) {
      if (this.context.valid(capture)) this.runtime.store.update(capture.sessionId, (state) => ({ ...state, work: { ...state.work, loading: false, error: errorInfo(error) } }));
    }
    if (this.context.valid(capture)) this.emit(capture.sessionId);
  }
}
