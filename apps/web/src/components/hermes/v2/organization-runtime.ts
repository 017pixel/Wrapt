import type { HermesV2Event, HermesV2Session } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { getChatRuntime, type ChatRuntime } from "./chat-runtime";
import { ChatError, errorInfo } from "./gateway-protocol";
import { ChatReadEvidence } from "./chat-read-evidence";
import { OrganizationClient } from "./organization-client";
import { OrganizationState } from "./organization-state";
import { OrganizationQueries } from "./organization-queries";
import { OrganizationActions } from "./organization-actions";
import { newOrganizationOwner, type OrganizationOwner } from "./organization-owner";
import { organizationPolicy } from "./organization-policy";
import { SidebarPreferences } from "./sidebar-preferences";
import { SidebarClock } from "./sidebar-time";
import { compareSidebarRows, sidebarOrder, withLocalActivity } from "./sidebar-resolver";
import { sourceLabel } from "./sidebar-format";
import { emptySidebar } from "./sidebar-empty";
import type { HermesV2SidebarOptions, SidebarGroupView, SidebarRowView } from "./sidebar-types";

export class OrganizationRuntime {
  readonly owners = new Map<string, OrganizationOwner>();
  readonly state = new OrganizationState();
  readonly preferences = new SidebarPreferences();
  readonly queries = new OrganizationQueries(this);
  readonly actions = new OrganizationActions(this);
  cycle = 0;
  private controller = new AbortController();
  private listeners = new Map<string, Set<() => void>>();
  private stops: (() => void)[] = [];
  private dirty = new Set<string>();
  private invalidating = false;
  private onlineGeneration = -1;
  private eventCursors = new Map<string, { socket: number; epoch: string; seq: number }>();
  private nativeSummaries = new Map<string, HermesV2Session>();
  private actionCache = new Map<string, ReturnType<OrganizationActions["forOwner"]>>();
  /** Sitzungen, deren lokaler Beleg aus dem Chat-Store mitläuft. */
  private watched = new Set<string>();
  private localState = new Map<string, boolean>();
  constructor(readonly chat: ChatRuntime = getChatRuntime(), readonly client = new OrganizationClient(), readonly clock = new SidebarClock()) {
    // Konfiguration allein startet weder HTTP noch WebSocket.
    chat.client.enableReadEvidence();
  }
  get signal(): AbortSignal { return this.controller.signal; }
  enabled(): boolean { return useAppPreferences.getState().hermesV2Enabled && this.stops.length > 0; }
  valid(owner: OrganizationOwner): boolean { return this.enabled() && owner.mounted && this.owners.get(owner.id) === owner; }
  capture(owner?: OrganizationOwner): () => boolean {
    const cycle = this.cycle, signal = this.signal, generation = owner?.generation, projectId = owner?.options.projectId;
    return () => cycle === this.cycle && !signal.aborted && this.enabled()
      && (!owner || (this.valid(owner) && owner.generation === generation && owner.options.projectId === projectId));
  }
  subscribe(id: string, listener: () => void): () => void {
    const set = this.listeners.get(id) ?? new Set(); set.add(listener); this.listeners.set(id, set);
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(id); };
  }
  getView(id: string) { return this.owners.get(id)?.view ?? emptySidebar; }
  acquire(options: HermesV2SidebarOptions): () => void {
    if (!useAppPreferences.getState().hermesV2Enabled) return () => {};
    if (!this.stops.length) this.start();
    let owner = this.owners.get(options.ownerId);
    if (!owner) {
      if (this.owners.size >= organizationPolicy.maxOwners) throw new ChatError("OWNER_LIMIT", "Zu viele geöffnete Hermes-Flächen.");
      owner = newOrganizationOwner(options); this.owners.set(owner.id, owner);
      owner.read = new ChatReadEvidence(this, owner);
    }
    if (owner.options.projectId !== options.projectId) { owner.projectMembers.clear(); owner.ids = []; owner.localIds.clear(); owner.queryAbort?.abort(); }
    owner.mounted = true; owner.options = options; owner.read?.sync(); this.emit(owner);
    if (owner.queryAbort?.signal.aborted || (!owner.ids.length && !owner.loading)) void this.queries.catalog(owner, true);
    for (const group of ["pinned", "snoozed", "settled"] as const) void this.background(owner, (valid) => this.queries.members(group, false, valid));
    const captured = owner;
    return () => {
      captured.mounted = false; captured.generation++; captured.queryAbort?.abort(); captured.read?.sync();
      queueMicrotask(() => {
        if (captured.mounted || this.owners.get(captured.id) !== captured) return;
        captured.read?.dispose(); this.owners.delete(captured.id); this.actionCache.delete(captured.id);
        if (![...this.owners.values()].some((entry) => entry.mounted)) this.dispose();
        else this.emitAll();
      });
    };
  }
  update(options: HermesV2SidebarOptions): void {
    const owner = this.owners.get(options.ownerId); if (!owner) return;
    const old = owner.options;
    owner.options = options;
    if (old.active !== options.active || old.visible !== options.visible || old.sessionId !== options.sessionId) owner.generation++;
    if (old.projectId !== options.projectId) {
      owner.projectMembers.clear(); owner.ids = []; owner.localIds.clear();
      if (this.valid(owner)) void this.queries.catalog(owner, true);
    }
    owner.read?.sync(); this.emitAll();
  }
  private start(): void {
    this.controller = new AbortController();
    this.stops.push(useAppPreferences.subscribe((state) => { if (!state.hermesV2Enabled) this.dispose(); }));
    this.preferences.start(() => this.emitAll());
    this.stops.push(this.chat.observeOrganization((event) => this.event(event)));
    this.stops.push(this.chat.store.subscribeList(() => this.chatSummaries()));
    this.stops.push(this.chat.client.subscribe(() => {
      if (this.chat.client.getSnapshot().state !== "online" || this.onlineGeneration === this.chat.client.generation) return;
      const reconnect = this.onlineGeneration >= 0; this.onlineGeneration = this.chat.client.generation;
      this.eventCursors.clear();
      if (reconnect) for (const owner of this.owners.values()) if (owner.mounted) {
        void this.queries.catalog(owner, true);
        for (const group of ["pinned", "snoozed", "settled"] as const) void this.background(owner, (valid) => this.queries.members(group, true, valid));
        void owner.read?.refresh();
      }
    }));
    const visibility = () => { for (const owner of this.owners.values()) owner.read?.sync(); this.emitAll(); };
    document.addEventListener("visibilitychange", visibility);
    this.stops.push(() => document.removeEventListener("visibilitychange", visibility));
    this.chat.client.activateReadEvidence();
    this.chatSummaries();
  }
  private async background(owner: OrganizationOwner, action: (valid: () => boolean) => Promise<void>): Promise<void> {
    const valid = this.capture(owner);
    if (!valid()) return;
    try { await action(valid); } catch (error) { if (valid()) { owner.error = errorInfo(error); this.emitAll(); } }
  }
  private chatSummaries(): void {
    if (!this.enabled()) return;
    const items = this.chat.store.getList().items;
    const changed = items.filter((item) => this.nativeSummaries.get(item.id) !== item);
    this.nativeSummaries = new Map(items.map((item) => [item.id, item]));
    if (!changed.length) return;
    for (const item of changed) this.state.markNative(item.id);
    this.state.mergeSessions(changed);
    for (const item of changed) this.mergeChatActivity(item.id);
    this.upsertCandidates(changed.map((item) => item.id));
    const cycle = this.cycle;
    void this.queries.metadata(changed.map((item) => item.id)).then(() => { if (cycle === this.cycle) this.emitAll(); }).catch((error: unknown) => {
      if (cycle === this.cycle) for (const owner of this.owners.values()) { owner.error = errorInfo(error); this.emit(owner); }
    });
    this.emitAll();
  }
  private event(event: HermesV2Event): void {
    if (!this.enabled()) return;
    if (event.type === "metadata.invalidated") {
      if ((this.state.metadata.get(event.payload.sessionId)?.revision ?? -1) >= event.payload.revision) return;
      this.state.invalidateMembers(); this.emitAll();
      if (this.dirty.size < organizationPolicy.maxCachedSessions) this.dirty.add(event.payload.sessionId);
      void this.flushInvalidations(); return;
    }
    if (event.type === "sessions.invalidated" || (event.type === "resources.invalidated" && event.payload.resource === "sessions")) {
      for (const owner of this.owners.values()) if (owner.mounted) void this.queries.catalog(owner, true);
      return;
    }
    if (!event.sessionId) return;
    const previous = this.eventCursors.get(event.sessionId);
    const socket = this.chat.client.generation;
    const snapshot = this.chat.store.peek(event.sessionId);
    if (previous && previous.socket === socket && ((previous.epoch !== event.epoch && snapshot?.epoch !== event.epoch)
      || (previous.epoch === event.epoch && (event.seq ?? 0) <= previous.seq))) return;
    if (this.eventCursors.size >= organizationPolicy.maxCachedSessions && !previous) return;
    this.eventCursors.set(event.sessionId, { socket, epoch: event.epoch, seq: event.seq ?? 0 });
    this.state.markNative(event.sessionId);
    if (event.type === "session.updated") this.state.mergeSessions([event.payload.session]);
    this.mergeChatActivity(event.sessionId, event.type === "session.updated" ? event : undefined);
    this.emitAll();
  }
  private mergeChatActivity(id: string, update?: Extract<HermesV2Event, { type: "session.updated" }>): void {
    const known = this.chat.store.peek(id);
    if (!known && !update) return;
    const old = this.state.activity.get(id);
    const running = update ? update.payload.session.running : known?.running;
    this.state.mergeSessions([], { [id]: {
      state: known?.requests.length ? "waiting_input" : running === true ? "working" : running === false ? "idle" : "unknown",
      turnStartedAt: update ? update.payload.turnStartedAt : known?.turnStartedAt ?? null,
      openRequestCount: known && !known.loading ? known.requests.length : null,
      subagentCount: old?.subagentCount ?? null, backgroundCount: old?.backgroundCount ?? null,
      observedAt: this.clock.now(), coverage: "partial",
    } });
  }
  /**
   * Lokaler Beleg: der Chat-Store kennt die Sitzung als laufend, auch wenn der
   * Server in diesem Moment "idle" meldet. Ohne diesen Beleg flackerte die
   * Zeile aus "In Arbeit" heraus.
   */
  private localBusy(id: string): boolean {
    const state = this.chat.store.peek(id);
    if (!state) return false;
    // Ein gestartetes Werkzeug zaehlt: der Server kann zwischen zwei
    // Werkzeugen kurz "idle" melden, waehrend der Aufruf noch laeuft.
    return state.running === true
      || state.generatingTool !== null
      || state.requests.length > 0
      || state.tools.some((tool) => tool.status === "running");
  }
  /** Zeile mit lokalem Beleg: die Gruppe bleibt "In Arbeit". */
  private withLocal(row: SidebarRowView): SidebarRowView {
    if (!this.chat.store.peek(row.id)) {
      this.localState.set(row.id, false);
      return row;
    }
    this.watchLocal(row.id);
    const busy = this.localBusy(row.id);
    this.localState.set(row.id, busy);
    return busy ? withLocalActivity(row) : row;
  }
  /** Der lokale Beleg entsteht im Chat-Store, nicht im Server. */
  private watchLocal(id: string): void {
    if (this.watched.has(id)) return;
    this.watched.add(id);
    this.stops.push(this.chat.store.subscribe(id, () => {
      const busy = this.localBusy(id);
      if (this.localState.get(id) === busy) return;
      this.localState.set(id, busy);
      this.emitAll();
    }));
  }
  private async flushInvalidations(): Promise<void> {
    if (this.invalidating) return;
    this.invalidating = true; const cycle = this.cycle, valid = this.capture();
    try {
      while (this.dirty.size && cycle === this.cycle && this.enabled()) {
        const ids = [...this.dirty].slice(0, organizationPolicy.pageSize); ids.forEach((id) => this.dirty.delete(id));
        await this.queries.metadata(ids, true, valid);
        if (!valid()) return;
        await this.queries.lookup(ids, true, valid);
        if (!valid()) return;
        if (cycle === this.cycle) this.upsertCandidates(ids);
        if (cycle === this.cycle) this.emitAll();
      }
    } catch (error) { if (cycle === this.cycle) for (const owner of this.owners.values()) { owner.error = errorInfo(error); this.emit(owner); } }
    finally { if (cycle === this.cycle) this.invalidating = false; }
  }
  private upsertCandidates(ids: readonly string[]): void {
    for (const owner of this.owners.values()) for (const id of ids) {
      if (!this.queries.matches(owner, id) && (this.state.sessions.has(id) || owner.query || owner.options.projectId)) continue;
      if (owner.localIds.size < 100) owner.localIds.add(id);
      if (!owner.ids.includes(id)) owner.ids = [id, ...owner.ids].slice(0, organizationPolicy.maxCatalogDepth);
    }
  }
  pins() { return this.state.rows(this.state.members.pinned.ids, this.clock.now()).filter((row) => row.pinned).sort((a, b) => (a.metadata.pinRank ?? 0) - (b.metadata.pinRank ?? 0) || a.id.localeCompare(b.id)); }
  pinsComplete(): boolean {
    const member = this.state.members.pinned;
    return member.complete && member.pinRevision === this.state.pinRevision && this.pins().length === member.ids.length;
  }
  emit(owner: OrganizationOwner): void {
    if (!this.valid(owner)) return;
    const now = this.clock.now();
    const candidates = new Set([...owner.ids, ...Object.values(this.state.members).flatMap((member) => member.ids)]);
    // Die Zeilen behalten ihre Kontextprojektion: sie zeigen das Projekt, in
    // dem sie in dieser Spalte bestaetigt wurden. Die Auswahlliste des
    // Filters entsteht dagegen aus den bestaetigten Projektzuordnungen -
    // im allgemeinen Kontext zeigen die Zeilen keine Projektkennung, und
    // ohne die Belege waere die Auswahl leer.
    const geladen = this.state.rows(candidates, now).map((row) => this.withLocal(row)).filter((row) => !owner.query || this.queries.matches(owner, row.id) || (row.missingSummary && row.id.toLocaleLowerCase().includes(owner.query.toLocaleLowerCase())));
    const nachId = new Map(geladen.map((row) => [row.id, row]));
    const rows = geladen
      .filter((row) => this.queries.matchesProject(owner, row.id))
      .map((row) => row.projectId === (owner.options.projectId ?? null) ? row : { ...row, projectId: owner.options.projectId ?? null });
    const labels = new Map<string, string>();
    for (const [id, beleg] of this.state.confirmedProjects) {
      if (labels.has(beleg.projectId)) continue;
      const row = nachId.get(id);
      labels.set(beleg.projectId, row ? sourceLabel({ ...row, projectId: beleg.projectId }) : beleg.projectId);
    }
    for (const row of rows) {
      if (!row.projectId || labels.has(row.projectId)) continue;
      labels.set(row.projectId, sourceLabel(row));
    }
    const projects = [...labels]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "de"));
    const groups: SidebarGroupView[] = sidebarOrder.map((id) => {
      const member = id === "pinned" || id === "snoozed" || id === "settled" ? this.state.members[id] : null;
      const groupRows = rows.filter((row) => row.group === id).sort(compareSidebarRows);
      return { id, rows: groupRows, count: groupRows.length, collapsed: id in this.preferences.value ? this.preferences.value[id as keyof typeof this.preferences.value] : false,
        loading: member?.loading ?? owner.loading, hasMore: member?.hasMore ?? owner.hasMore, complete: member?.complete ?? !owner.partial };
    });
    const undo = owner.undo && owner.undo.expiresAt > now ? { ...owner.undo, remainingMs: owner.undo.expiresAt - now } : null;
    let actions = this.actionCache.get(owner.id);
    if (!actions) { actions = this.actions.forOwner(owner.id); this.actionCache.set(owner.id, actions); }
    owner.view = { ...actions, rows, groups, projects, activeSessionId: this.chat.owners.records.get(owner.id)?.sessionId ?? null,
      search: { query: owner.query, loading: owner.loading, hasMore: owner.hasMore, nextOffset: owner.nextOffset,
        loadedCount: owner.ids.length, partial: owner.partial || this.state.overflowed, limitReached: owner.limitReached || this.state.overflowed }, collapsed: this.preferences.value,
      loading: owner.loading, busySessionIds: [...owner.busy], error: owner.error ?? (this.state.overflowed ? { code: "CACHE_LIMIT", message: "Die gemeinsame Anzeigegrenze ist erreicht. Weitere Sitzungen sind nicht vollständig geladen.", outcome: "not_sent" } : null), undoView: undo,
      pinMembershipComplete: this.pinsComplete(), readView: owner.read?.view ?? emptySidebar.readView };
    for (const listener of this.listeners.get(owner.id) ?? []) listener();
  }
  emitAll(): void {
    for (const owner of this.owners.values()) this.emit(owner);
    const visible = [...this.owners.values()].some((owner) => this.valid(owner) && owner.options.active !== false && owner.options.visible !== false)
      && document.visibilityState !== "hidden";
    if (!visible) { this.clock.stop(); return; }
    const rows = this.state.rows(this.state.metadata.keys(), this.clock.now());
    this.clock.schedule([...rows.flatMap((row) => row.snoozedUntil === null ? [] : [row.snoozedUntil]), ...[...this.owners.values()].flatMap((owner) => owner.undo ? [owner.undo.expiresAt] : [])],
      rows.some((row) => row.durationMs !== null) || [...this.owners.values()].some((owner) => owner.undo && owner.undo.expiresAt > this.clock.now()), () => this.emitAll());
  }
  forgetDeletedSessions(ids: readonly string[]): void {
    this.state.forgetDeletedSessions(ids);
    const removed = new Set(ids);
    for (const id of ids) { this.nativeSummaries.delete(id); this.eventCursors.delete(id); this.dirty.delete(id); this.watched.delete(id); this.localState.delete(id); }
    for (const owner of this.owners.values()) {
      owner.queryAbort?.abort(); owner.queryGeneration++;
      owner.ids = owner.ids.filter((id) => !removed.has(id));
      for (const id of ids) { owner.localIds.delete(id); owner.projectMembers.delete(id); }
      if (this.valid(owner)) void this.queries.catalog(owner, true);
    }
    this.emitAll();
  }
  dispose(): void {
    this.cycle++; this.controller.abort(); this.stops.splice(0).forEach((stop) => stop());
    this.clock.stop(); this.preferences.dispose(); this.queries.dispose(); this.dirty.clear(); this.invalidating = false; this.eventCursors.clear(); this.nativeSummaries.clear(); this.onlineGeneration = -1;
    this.watched.clear(); this.localState.clear();
    const ids = [...this.owners.keys()];
    for (const owner of this.owners.values()) { owner.mounted = false; owner.queryAbort?.abort(); owner.read?.dispose(); }
    this.owners.clear(); this.state.clear(); this.actionCache.clear();
    for (const id of ids) for (const listener of this.listeners.get(id) ?? []) listener();
  }
}
let shared: OrganizationRuntime | null = null;
export function getOrganizationRuntime(): OrganizationRuntime { return shared ??= new OrganizationRuntime(); }
