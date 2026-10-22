import type { HermesV2CatalogQuery, HermesV2Event, HermesV2Message, HermesV2ServerMessage, HermesV2Session } from "@wrapt/contracts/hermes-v2";
import type { DashboardReader, SessionRecord, UpstreamEvent } from "../types.js";
import { OrganizationRepository, type SourceRow } from "./repository.js";
import { ScopeResolver, type OrganizationScope } from "./scope.js";
import { EvidenceRegistry } from "./evidence.js";
import { ReadProjection } from "./projection.js";
import { OrganizationActions } from "./actions.js";
import { OrganizationReconciler } from "./reconcile.js";
import { SummaryCatalog, type ActivityReader } from "./catalog.js";
import { confirmLineage } from "./lineage.js";
import { organizationPolicy } from "./policy.js";
import type { HistoryContext } from "../history-context.js";

export interface OrganizationOptions { databasePath: string; homeDirectory: string }
export interface OrganizationHooks {
  invalidate(owner: string, session: string, revision: number): void;
  activity: ActivityReader;
  hasRequests(scope: string, session: string): boolean;
  projectSummary?(summary: HermesV2Session): HermesV2Session;
}
export class OrganizationService {
  readonly repo: OrganizationRepository;
  readonly scopes: ScopeResolver;
  readonly evidence: EvidenceRegistry;
  readonly projection: ReadProjection;
  readonly actions: OrganizationActions;
  readonly reconcile: OrganizationReconciler;
  readonly catalog: SummaryCatalog;
  private disposed = false;
  private active = new Set<string>();
  private summary: Promise<void> | null = null;
  private summaryAgain = false;
  private summaryOffset = 0;
  private lastSummaryOffset = 0;
  private summaryKnownPending = true;
  private latestEpoch: string | null = null;
  private requestState = new Map<string, boolean>();
  constructor(options: OrganizationOptions, dashboard: DashboardReader, authority: string,
    projectCwd: (id: string | null) => Promise<string>, hooks: OrganizationHooks, private now = Date.now) {
    this.repo = new OrganizationRepository(options.databasePath, hooks.invalidate, now);
    this.scopes = new ScopeResolver(dashboard, authority, options.homeDirectory);
    this.evidence = new EvidenceRegistry(now);
    this.projection = new ReadProjection(this.repo, this.evidence, now);
    this.actions = new OrganizationActions(this.repo, (scope, session) => this.requestState.get(`${scope}:${session}`) === true || hooks.hasRequests(scope, session), now);
    this.reconcile = new OrganizationReconciler(this.repo, dashboard, () => {
      this.summaryOffset = this.lastSummaryOffset;
      this.refreshSummary();
    }, now, () => this.active.size > 0 && !this.disposed);
    this.catalog = new SummaryCatalog(dashboard, async (owner, scope, sessions) => {
      const activity = await hooks.activity(owner, scope, sessions);
      for (const [id, value] of Object.entries(activity)) {
        if (this.requestState.size >= organizationPolicy.catalogDepth && !this.requestState.has(`${scope.id}:${id}`)) this.requestState.delete(this.requestState.keys().next().value!);
        if (value.state === "waiting_input" || (value.openRequestCount ?? 0) > 0) this.requestState.set(`${scope.id}:${id}`, true);
        else if (value.openRequestCount === 0) this.requestState.set(`${scope.id}:${id}`, false);
      }
      return activity;
    }, (id) => projectCwd(id), now, (scope, rows) => this.confirmRows(scope, rows), hooks.projectSummary);
  }
  attach(owner: string, connection: string): void {
    if (!this.active.size) this.summaryKnownPending = true;
    this.active.add(`${owner}\0${connection}`);
    void this.scopes.current().then(() => {
      if (!this.disposed && this.active.size) { if (this.latestEpoch) this.epoch(this.latestEpoch); this.refreshSummary(); }
    }).catch(() => {
      // REST zeigt SOURCE_IDENTITY_UNKNOWN. Chat bleibt ohne geratenen Beleg benutzbar.
    });
  }
  detach(owner: string, connection: string): void { this.active.delete(`${owner}\0${connection}`); }
  async context(): Promise<OrganizationScope> { return this.scopes.current(); }
  async prepareSnooze(owner: string, scope: OrganizationScope, session: string): Promise<void> { await this.catalog.lookup(owner, scope, [session]); }
  history(context: HistoryContext, session: string, raw: { profile?: string | undefined; messages: unknown[] }, messages: readonly HermesV2Message[]): void {
    if (!context.valid() || raw.profile !== context.scope.profile || this.disposed) return;
    this.projection.history(context.scope, session, raw.messages, messages);
  }
  observe(record: SessionRecord, raw: UpstreamEvent, normalized: HermesV2Event): void {
    const scope = this.scopes.confirmed;
    if (!scope || record.profileName !== scope.profile || this.disposed) return;
    if (normalized.type === "request.opened") this.requestState.set(`${scope.id}:${record.storedId}`, true);
    if (normalized.type === "request.closed") this.requestState.set(`${scope.id}:${record.storedId}`, record.snapshot.requests.length > 0);
    this.projection.event(scope, record, raw, normalized);
  }
  frame(owner: string, frame: HermesV2ServerMessage, optedIn: boolean): HermesV2ServerMessage {
    return this.projection.frame(owner, frame, optedIn);
  }
  copyRows(from: readonly HermesV2Message[], to: readonly HermesV2Message[]): void { this.projection.copyRows(from, to); }
  epoch(epoch: string): void {
    const changed = this.latestEpoch !== null && this.latestEpoch !== epoch;
    this.latestEpoch = epoch;
    const scope = this.scopes.confirmed;
    if (!scope || this.disposed) return;
    this.loseSources("scope=? AND namespace='answer' AND epoch IS NOT NULL AND epoch<>? AND row_id IS NULL AND uid IS NULL AND available=1", [scope.id, epoch], `epoch:${epoch}`);
    if (changed) this.scopes.invalidate();
  }
  replayEvicted(record: SessionRecord, earliest: number): void {
    const scope = this.scopes.confirmed;
    if (!scope || record.profileName !== scope.profile || !record.liveId) return;
    this.loseSources("scope=? AND namespace='answer' AND epoch=? AND live_id=? AND seq<? AND row_id IS NULL AND uid IS NULL AND available=1", [scope.id, record.epoch, record.liveId, earliest], `replay:${record.epoch}:${record.liveId}:${earliest}`);
  }
  private loseSources(where: string, values: Array<string | number>, signature: string): void {
    for (;;) {
      const batch = this.repo.all<SourceRow>(`SELECT * FROM hermes_v2_sources WHERE ${where} LIMIT 512`, ...values);
      if (!batch.length) break;
      this.repo.transaction(() => {
        for (const source of batch) {
          this.repo.run("UPDATE hermes_v2_sources SET available=0 WHERE id=?", source.id);
          for (const item of this.repo.all<{ session_id: string }>("SELECT session_id FROM hermes_v2_source_sessions WHERE source_id=?", source.id))
            this.repo.setCoverage(source.scope, item.session_id, "gap", "UNAVAILABLE_CONTENT", signature, this.now());
        }
      });
    }
  }
  changed(): void { if (this.active.size && !this.disposed) { this.summaryOffset = 0; this.summaryKnownPending = true; this.refreshSummary(); } }
  async page(owner: string, query: HermesV2CatalogQuery) {
    const scope = await this.context();
    const result = await this.catalog.page(owner, scope, query);
    this.reconcile.enqueue(scope, result.sessions.map((row) => row.id));
    return result;
  }
  confirmRows(scope: OrganizationScope, rows: readonly unknown[]): void {
    for (const row of rows) confirmLineage(this.repo, scope.id, row, this.now());
  }
  private refreshSummary(): void {
    if (this.summary) { this.summaryAgain = true; return; }
    if (this.disposed || !this.active.size) return;
    this.summary = (async () => {
      const scope = await this.context();
      if (!this.active.size || this.disposed) return;
      const known = this.summaryKnownPending ? this.repo.all<{ session_id: string }>("SELECT DISTINCT session_id FROM hermes_v2_session_metadata WHERE scope=? ORDER BY updated_at DESC LIMIT 512", scope.id) : [];
      this.summaryKnownPending = false;
      this.lastSummaryOffset = this.summaryOffset;
      const result = await this.catalog.page("", scope, { offset: this.summaryOffset, limit: 100 });
      if (!this.active.size || this.disposed) return;
      this.summaryOffset = result.nextOffset ?? 0;
      this.reconcile.enqueue(scope, [...known.map((row) => row.session_id), ...result.sessions.map((row) => row.id)]);
    })().catch(() => { /* Bestehende Daten bleiben erhalten; REST zeigt den Fehler beim expliziten Abruf. */ })
      .finally(() => { this.summary = null; if (this.summaryAgain) { this.summaryAgain = false; this.refreshSummary(); } });
  }
  dispose(): void {
    this.disposed = true; this.active.clear(); this.requestState.clear(); this.reconcile.stop(); this.evidence.clear(); this.actions.clear(); this.repo.close();
  }
}
