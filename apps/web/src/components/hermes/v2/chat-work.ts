import type { ChatRuntime } from "./chat-runtime";
import type { OwnerRecord } from "./chat-owners";
import type { HermesV2Event } from "@wrapt/contracts/hermes-v2";
import type { ChatWorkView } from "./chat-work-types";
import { emptyChatWork } from "./chat-work-types";
import { workActive, workKey, workTree } from "./chat-work-state";
import { ChatWorkContext } from "./chat-work-context";
import { ChatWorkReads } from "./chat-work-reads";
import { ChatWorkActions } from "./chat-work-actions";

const terminal = new Set(["completed", "complete", "failed", "error", "timeout", "interrupted", "exited", "killed", "terminated"]);
const activeCount = (rows: readonly { status: string | null }[], loaded: boolean): number | null => !loaded
  || rows.some((row) => row.status === null || (!workActive(row.status) && !terminal.has(row.status))) ? null : rows.filter((row) => workActive(row.status)).length;

export class ChatWork {
  readonly context: ChatWorkContext;
  readonly reads: ChatWorkReads;
  readonly actions: ChatWorkActions;
  constructor(private readonly runtime: ChatRuntime) {
    this.context = new ChatWorkContext(runtime);
    this.reads = new ChatWorkReads(runtime, this.context, (id) => this.emit(id));
    this.actions = new ChatWorkActions(runtime, this.context, (id) => this.reads.schedule(id));
  }
  view(owner: OwnerRecord): ChatWorkView {
    const state = owner.sessionId ? this.runtime.store.peek(owner.sessionId) : null;
    if (!state) return emptyChatWork;
    let available = false;
    try { this.context.ready(this.runtime.owners.capture(owner.id)); available = true; } catch { /* fehlende aktuelle Bereitschaft */ }
    const work = state.work;
    return { available, loading: work.loading, error: work.error, revision: work.revision, coverage: work.coverage,
      subagents: workTree(work.subagents), delegations: work.delegations.map((row) => ({ ...row, key: workKey(row.kind, row.delegationId, row.taskIndex) })),
      processes: work.processes.map((row) => ({ ...row, key: workKey(row.kind, row.id) })), tasks: work.tasks.map((row) => ({ ...row, key: workKey(row.kind, row.id) })),
      counts: { subagents: activeCount(work.subagents, work.loaded),
        processes: activeCount(work.processes, work.loaded),
        tasks: work.loaded ? work.tasks.filter((row) => row.status === "running").length : null },
      queue: { head: work.queuedText, observed: work.queueObserved }, actions: this.actions.entries(owner) };
  }
  invalidate(owner: OwnerRecord): void {
    this.context.invalidate(owner); this.actions.invalidate(owner);
    if (owner.sessionId && this.runtime.store.peek(owner.sessionId)) this.runtime.store.update(owner.sessionId, (state) => ({ ...state,
      work: { ...state.work, loaded: false, loading: false } }));
  }
  snapshot(id: string): void {
    for (const owner of this.runtime.owners.records.values()) if (owner.sessionId === id) this.invalidate(owner);
    this.reads.schedule(id, true);
  }
  event(id: string, event: HermesV2Event): void {
    if (event.type === "work.updated" && event.payload.revision === this.runtime.store.get(id).work.revision) this.actions.observe(id, [event.payload.change]);
    if (event.type === "work.invalidated") this.reads.schedule(id);
    if (["work.updated", "work.invalidated"].includes(event.type)) this.emit(id);
  }
  sync(): void { this.actions.prune(); this.reads.sync(); }
  emit(id: string): void {
    for (const owner of this.runtime.owners.records.values()) if (owner.mounted && owner.sessionId === id) this.runtime.owners.emit(owner);
  }
  dispose(): void { this.actions.dispose(); this.reads.dispose(); }
}
