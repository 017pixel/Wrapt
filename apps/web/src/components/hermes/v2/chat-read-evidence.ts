import { errorInfo } from "./gateway-protocol";
import type { OrganizationOwner } from "./organization-owner";
import type { OrganizationRuntime } from "./organization-runtime";
import type { HermesV2ReadView, ReadGeneration, SidebarNoticeView } from "./sidebar-types";
import { organizationPolicy } from "./organization-policy";

/** Beobachtet ausschließlich die bereits angewandte Projektion des vorhandenen Chatowners. */
export class ChatReadEvidence {
  private stopOwner: () => void;
  private stopSession: (() => void) | null = null;
  private sessionId: string | null = null;
  private context = "";
  private generation: ReadGeneration | null = null;
  private handles = new Set<string>();
  private acknowledged = new Set<string>();
  private blocked = new Set<string>();
  private notices: SidebarNoticeView[] = [];
  private cursor: string | null = null;
  private hasMore = true;
  private loading = false;
  private attempted = false;
  private error: HermesV2ReadView["error"] = null;
  private controller = new AbortController();
  private noticeTask: Promise<void> | null = null;
  private pending = new Set<string>();
  private batch: Promise<void> | null = null;
  private disposed = false;
  view: HermesV2ReadView;
  constructor(private readonly runtime: OrganizationRuntime, private readonly owner: OrganizationOwner) {
    this.view = this.buildView();
    this.stopOwner = runtime.chat.owners.subscribe(owner.id, () => this.sync());
    this.sync();
  }
  sync(): void {
    if (this.disposed) return;
    const chatOwner = this.runtime.chat.owners.records.get(this.owner.id);
    const id = chatOwner?.mounted ? chatOwner.sessionId : null;
    if (id !== this.sessionId) {
      this.stopSession?.(); this.controller.abort(); this.controller = new AbortController();
      this.sessionId = id; this.notices = []; this.cursor = null; this.hasMore = true; this.loading = false;
      this.noticeTask = null; this.attempted = false; this.acknowledged.clear(); this.blocked.clear(); this.error = null;
      this.stopSession = id ? this.runtime.chat.store.subscribe(id, () => this.sync()) : null;
    }
    const state = id ? this.runtime.chat.store.peek(id) : null;
    const visible = !!chatOwner?.mounted && chatOwner.options.active !== false && chatOwner.options.visible !== false
      && this.owner.options.active !== false && this.owner.options.visible !== false
      && (typeof document === "undefined" || document.visibilityState !== "hidden")
      && (this.owner.options.sessionId === undefined || this.owner.options.sessionId === id)
      && this.runtime.valid(this.owner) && state !== null && !state.loading;
    const context = `${chatOwner?.generation ?? -1}:${id}:${state?.generation ?? -1}:${visible}:${this.owner.generation}`;
    let changed = false;
    if (context !== this.context) {
      this.context = context; this.generation = visible ? Object.freeze({}) as ReadGeneration : null;
      this.pending.clear(); this.batch = null; changed = true;
    }
    const applied = new Set([...(state?.messages.flatMap((message) => message.readEvidence ? [message.readEvidence] : []) ?? []),
      ...this.notices.flatMap((notice) => notice.readEvidence ? [notice.readEvidence] : []), ...(state?.error?.readEvidence ? [state.error.readEvidence] : [])]);
    this.blocked = new Set([...this.blocked].filter((handle) => applied.has(handle)));
    const handles = new Set<string>();
    if (visible && state) {
      for (const message of state.messages) if (message.role === "assistant" && message.status === "complete" && message.readEvidence && !this.blocked.has(message.readEvidence)) handles.add(message.readEvidence);
      for (const notice of this.notices) if (notice.readEvidence && !this.blocked.has(notice.readEvidence)) handles.add(notice.readEvidence);
      if (state.error?.readEvidence && !this.blocked.has(state.error.readEvidence)) handles.add(state.error.readEvidence);
    }
    if (handles.size !== this.handles.size || [...handles].some((handle) => !this.handles.has(handle))) changed = true;
    this.handles = handles;
    if (changed) this.publish();
    if (visible && !this.attempted && !this.noticeTask) void this.loadMore();
  }
  private buildView(): HermesV2ReadView {
    const state = this.sessionId ? this.runtime.chat.store.peek(this.sessionId) : null;
    const liveError = state?.error?.readEvidence ? [{ id: `live-error:${state.generation}:${state.error.readEvidence}`,
      kind: "decision-error" as const, text: state.error.message, observedAt: this.runtime.clock.now(), completedAt: null,
      readEvidence: this.blocked.has(state.error.readEvidence) ? null : state.error.readEvidence }] : [];
    return { generation: this.generation, sessionId: this.sessionId, notices: [...liveError, ...this.notices], loading: this.loading,
      hasMore: this.hasMore, error: this.error, loadMore: () => this.loadMore(), refresh: () => this.refresh(),
      onVisibleEvidence: (generation, handles) => this.visible(generation, handles) };
  }
  private publish(): void { this.view = this.buildView(); this.runtime.emit(this.owner); }
  async loadMore(): Promise<void> {
    if (this.noticeTask) return this.noticeTask;
    if (!this.sessionId || !this.generation || !this.hasMore || this.disposed) return;
    const id = this.sessionId, controller = this.controller, cursor = this.cursor;
    this.loading = true; this.attempted = true; this.publish();
    const task = (async () => {
      try {
        const page = await this.runtime.client.notices(id, cursor, controller.signal);
        if (controller.signal.aborted || this.disposed || this.sessionId !== id) return;
        if (page.hasMore && (!page.nextCursor || page.nextCursor === cursor)) throw new Error("invalid notice cursor");
        this.runtime.clock.sample(page.serverNow);
        const rows = page.items.map((item): SidebarNoticeView => ({ ...item, text: item.kind === "historical-decision-error"
          ? "Die Sitzung endete mit einem Entscheidungsfehler. Der ursprüngliche Fehlertext ist nicht mehr verfügbar."
          : "Für diesen Abschluss ist kein vollständiger Antwortinhalt mehr verfügbar. Dieser Hinweis bestätigt keinen gelesenen Inhalt." }));
        const merged = new Map([...this.notices, ...rows].map((row) => [row.id, row]));
        this.notices = [...merged.values()].slice(0, organizationPolicy.maxNotices);
        this.cursor = page.nextCursor; this.hasMore = page.hasMore && merged.size < organizationPolicy.maxNotices;
      } catch (error) { if (!controller.signal.aborted && !this.disposed) this.error = errorInfo(error); }
      finally { if (!controller.signal.aborted && !this.disposed) { this.loading = false; this.sync(); this.publish(); } }
    })();
    this.noticeTask = task;
    await task;
    if (this.noticeTask === task) this.noticeTask = null;
  }
  async refresh(): Promise<void> {
    const valid = this.runtime.capture(this.owner);
    if (this.disposed || !valid()) return;
    this.controller.abort(); this.controller = new AbortController(); this.noticeTask = null;
    this.notices = []; this.cursor = null; this.hasMore = true; this.error = null; this.attempted = false;
    const controller = this.controller;
    if (this.generation && this.blocked.size) {
      try { await this.runtime.chat.refreshEvidence(this.owner.id, [...this.blocked]); }
      catch (error) { if (!controller.signal.aborted && valid()) this.error = errorInfo(error); }
    }
    if (controller.signal.aborted || this.disposed || !valid()) return;
    this.context = ""; this.sync();
    await this.loadMore();
  }
  private valid(generation: ReadGeneration): boolean {
    this.sync();
    return !this.disposed && this.generation === generation && !!this.sessionId && this.runtime.valid(this.owner);
  }
  private async visible(generation: ReadGeneration, handles: readonly string[]): Promise<void> {
    if (!this.valid(generation) || handles.length > organizationPolicy.maxNotices || handles.some((handle) => !this.handles.has(handle))) return;
    for (const handle of handles) if (!this.acknowledged.has(handle)) this.pending.add(handle);
    if (this.batch) return this.batch;
    const id = this.sessionId!;
    const task = Promise.resolve().then(async () => {
      while (this.pending.size && this.valid(generation) && this.sessionId === id) {
        const evidence = [...this.pending].slice(0, organizationPolicy.maxReadBatch);
        evidence.forEach((handle) => this.pending.delete(handle));
        if (evidence.some((handle) => !this.handles.has(handle))) return;
        try {
          const result = await this.runtime.client.read(id, evidence, this.controller.signal);
          if (!this.valid(generation)) return;
          this.runtime.clock.sample(result.serverNow);
          evidence.forEach((handle) => this.acknowledged.add(handle));
          if (this.acknowledged.size > 4096) this.acknowledged = new Set([...this.acknowledged].slice(-4096));
          await this.runtime.queries.metadata([id], true, () => this.valid(generation));
          if (!this.valid(generation)) return;
          this.runtime.emitAll();
        } catch (error) {
          if (!this.valid(generation)) return;
          this.error = errorInfo(error); this.pending.clear();
          if (this.error.code === "READ_EVIDENCE_EXPIRED" || this.error.code === "READ_EVIDENCE_INVALID") {
            evidence.forEach((handle) => this.blocked.add(handle));
            this.context = ""; this.sync();
            await this.refresh();
          }
          this.publish(); return;
        }
      }
    }).finally(() => { if (this.batch === task) this.batch = null; });
    this.batch = task; await task;
  }
  dispose(): void {
    this.disposed = true; this.generation = null; this.controller.abort(); this.stopOwner(); this.stopSession?.(); this.pending.clear();
  }
}
