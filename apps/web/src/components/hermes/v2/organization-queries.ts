import { ChatError, errorInfo } from "./gateway-protocol";
import { OrganizationConflict } from "./organization-client";
import type { OrganizationRuntime } from "./organization-runtime";
import type { OrganizationOwner } from "./organization-owner";
import type { MemberShelf } from "./sidebar-types";
import { organizationPolicy } from "./organization-policy";
import { isCatalogDepthEnd } from "./organization-pagination";

export class OrganizationQueries {
  private memberReads = new Map<MemberShelf, Promise<void>>();
  private metadataReads = new Map<string, Promise<void>>();
  constructor(private readonly runtime: OrganizationRuntime) {}
  dispose(): void { this.memberReads.clear(); this.metadataReads.clear(); }
  async catalog(owner: OrganizationOwner, reset = false): Promise<boolean> {
    const current = this.runtime.capture(owner), signal = this.runtime.signal;
    if (!current()) return false;
    if (reset) { owner.queryAbort?.abort(); owner.queryGeneration++; owner.nextOffset = 0; owner.projectMembers.clear(); }
    else if (owner.loading || !owner.hasMore) return false;
    const generation = owner.queryGeneration;
    const offset = owner.nextOffset ?? 0;
    const query = owner.query;
    const projectId = owner.options.projectId ?? null;
    const observationRevision = this.runtime.state.beginSummaryRead();
    const controller = new AbortController(); owner.queryAbort = controller;
    const stop = () => controller.abort(); signal.addEventListener("abort", stop, { once: true });
    const valid = () => current() && generation === owner.queryGeneration && projectId === (owner.options.projectId ?? null) && !controller.signal.aborted;
    owner.loading = true; owner.error = null; this.runtime.emit(owner);
    try {
      const page = await this.runtime.client.catalog({ offset, limit: organizationPolicy.pageSize,
        ...(query ? { q: query } : {}), ...(projectId ? { projectId } : {}) }, controller.signal);
      if (!valid()) return false;
      if (page.offset !== offset || (page.hasMore && !(page.nextOffset === null && isCatalogDepthEnd(page))
        && (page.nextOffset === null || page.nextOffset <= offset))) throw new ChatError("PROTOCOL_MISMATCH", "Die Katalogseite hat keinen gültigen Fortschritt.");
      this.runtime.clock.sample(page.serverNow); this.runtime.state.applySummaryRead(page.sessions, page.activity, [], observationRevision);
      if (projectId) for (const session of page.sessions) {
        const locationRevision = this.runtime.state.locationRevision(session.id);
        if (this.runtime.state.sessions.get(session.id)?.cwd === session.cwd && locationRevision <= observationRevision
          && (owner.projectMembers.has(session.id) || owner.projectMembers.size < organizationPolicy.maxCatalogDepth)) owner.projectMembers.set(session.id, { projectId, locationRevision });
        // Die Zuordnung gilt danach fuer alle Spalten: der Projektfilter
        // braucht sie auch im allgemeinen Kontext.
        if (this.runtime.state.sessions.get(session.id)?.cwd === session.cwd && locationRevision <= observationRevision)
          this.runtime.state.confirmedProjects.set(session.id, { projectId, locationRevision });
      }
      await this.metadata(page.sessions.map((session) => session.id), false, valid);
      if (!valid()) return false;
      const ids = [...owner.localIds].filter((id) => this.matches(owner, id));
      owner.ids = [...new Set([...ids, ...(reset ? [] : owner.ids), ...page.sessions.map((session) => session.id)])].slice(0, organizationPolicy.maxCatalogDepth);
      owner.limitReached = (page.nextOffset ?? page.offset + page.limit) >= organizationPolicy.maxCatalogDepth && page.coverage === "partial";
      owner.nextOffset = owner.limitReached ? null : page.nextOffset; owner.hasMore = page.hasMore && !owner.limitReached;
      owner.partial = page.coverage === "partial" || page.hasMore;
      return true;
    } catch (error) { if (valid()) owner.error = errorInfo(error); }
    finally {
      signal.removeEventListener("abort", stop);
      if (current() && generation === owner.queryGeneration) { owner.loading = false; if (owner.queryAbort === controller) owner.queryAbort = null; this.runtime.emitAll(); }
    }
    return false;
  }
  matches(owner: OrganizationOwner, id: string): boolean {
    const item = this.runtime.state.sessions.get(id);
    if (!item || !this.matchesProject(owner, id)) return false;
    const query = owner.query.toLocaleLowerCase();
    return !query || `${item.title} ${item.id} ${item.cwd ?? ""}`.toLocaleLowerCase().includes(query);
  }
  matchesProject(owner: OrganizationOwner, id: string): boolean {
    if (!owner.options.projectId) return true;
    const proof = owner.projectMembers.get(id);
    return !!proof && proof.projectId === owner.options.projectId && this.runtime.state.sessions.has(id)
      && proof.locationRevision === this.runtime.state.locationRevision(id);
  }
  async metadata(ids: readonly string[], fresh = false, continueRead = () => true): Promise<void> {
    const current = this.runtime.capture(), signal = this.runtime.signal;
    const valid = () => current() && continueRead();
    if (!ids.length || !valid()) return;
    const unique = [...new Set(ids)];
    for (let start = 0; start < unique.length; start += organizationPolicy.pageSize) {
      if (!valid()) return;
      const batch = unique.slice(start, start + organizationPolicy.pageSize);
      const key = JSON.stringify([...batch].sort());
      const existing = this.metadataReads.get(key);
      if (existing) { await existing; if (!valid()) return; if (!fresh) continue; }
      const task = this.runtime.client.metadata(batch, signal).then((items) => {
        if (!current()) return;
        for (const item of items) this.runtime.clock.sample(item.serverNow);
        this.runtime.state.mergeMetadata(items);
      }).finally(() => { if (this.metadataReads.get(key) === task) this.metadataReads.delete(key); });
      this.metadataReads.set(key, task); await task;
      if (!valid()) return;
    }
  }
  members(group: MemberShelf, reset = false, continueRead = () => true): Promise<void> {
    const current = this.runtime.capture(), valid = () => current() && continueRead();
    if (!valid()) return Promise.resolve();
    const running = this.memberReads.get(group);
    const cycle = this.runtime.cycle;
    if (running) return running.then(() => {
      if (cycle !== this.runtime.cycle || !valid()) return;
      if (reset || this.runtime.state.members[group].revision === null) return this.members(group, reset, valid);
    });
    // Globale Seite samt Summary-/Activitybackfill bleibt dem ursprünglichen Runtime
    // zugeordnet. Ownerguard gilt für Start und individuelle Folgeaktionen.
    const task = this.loadMembers(group, reset, current).finally(() => { if (this.memberReads.get(group) === task) this.memberReads.delete(group); });
    this.memberReads.set(group, task); return task;
  }
  private async loadMembers(group: MemberShelf, reset: boolean, continueRead: () => boolean): Promise<void> {
    if (!continueRead()) return;
    const current = this.runtime.capture();
    const valid = () => current() && continueRead();
    const previous = this.runtime.state.members[group];
    if (reset || (!previous.complete && !previous.hasMore) || (group === "pinned" && previous.pinRevision < this.runtime.state.pinRevision)) this.runtime.state.resetMembers(group);
    const member = this.runtime.state.members[group];
    if (!this.runtime.enabled() || member.complete || (!member.hasMore && member.ids.length)) return;
    member.loading = true; this.runtime.emitAll();
    const invalidation = this.runtime.state.membershipInvalidation;
    try {
      const page = await this.runtime.client.members(group, member.cursor, this.runtime.signal);
      if (!valid()) return;
      if ((member.revision !== null && member.revision !== page.membershipRevision)
        || (group === "pinned" && member.revision !== null && member.pinRevision !== page.pinRevision)) throw new ChatError("ORGANIZATION_CONFLICT", "Die Mitgliederliste wurde inzwischen geändert. Bitte neu laden.");
      if (page.hasMore && (!page.nextCursor || page.nextCursor === member.cursor)) throw new ChatError("PROTOCOL_MISMATCH", "Die Mitgliederliste hat keinen gültigen Fortschritt.");
      const invalidated = invalidation !== this.runtime.state.membershipInvalidation
        || page.items.some((item) => (this.runtime.state.metadata.get(item.sessionId)?.revision ?? -1) > item.revision)
        || page.pinRevision < this.runtime.state.pinRevision;
      this.runtime.clock.sample(page.serverNow); this.runtime.state.mergeMetadata(page.items, group);
      const ids = [...new Set([...member.ids, ...page.items.map((item) => item.sessionId)])];
      if (ids.length > organizationPolicy.maxMembers || (page.hasMore && ids.length === organizationPolicy.maxMembers)) throw new ChatError("MEMBERSHIP_LIMIT", "Die Mitgliederliste hat ihre Anzeigegrenze erreicht.");
      this.runtime.state.advancePinRevision(page.pinRevision, group);
      const projectionInvalidation = this.runtime.state.membershipInvalidation;
      if (!valid()) return;
      await this.lookup(page.items.map((item) => item.sessionId), true, valid);
      if (!valid()) return;
      // Erst der erfolgreiche Backfill schließt die Seite ab. Nach einem Fehler
      // bleibt ihr bisheriger Cursor für ausdrückliches Nachladen erhalten.
      member.ids = ids; member.revision = page.membershipRevision; member.pinRevision = page.pinRevision;
      const stale = invalidated || projectionInvalidation !== this.runtime.state.membershipInvalidation;
      member.cursor = stale ? null : page.nextCursor;
      member.hasMore = !stale && page.hasMore; member.complete = !stale && !page.hasMore;
    } catch (error) {
      if (!valid()) return;
      if (error instanceof OrganizationConflict) {
        this.runtime.state.mergeMetadata(error.data.items);
        this.runtime.state.advancePinRevision(error.data.pinRevision);
        this.runtime.clock.sample(error.data.serverNow);
      }
      member.complete = false;
      if (error instanceof ChatError && error.code === "ORGANIZATION_CONFLICT") this.runtime.state.resetMembers(group);
      throw error;
    } finally { if (current() && this.runtime.state.members[group] === member) { member.loading = false; this.runtime.emitAll(); } }
  }
  async lookup(ids: readonly string[], refresh = false, continueRead = () => true): Promise<void> {
    const current = this.runtime.capture(), signal = this.runtime.signal, valid = () => current() && continueRead();
    if (!valid()) return;
    const requested = [...new Set(ids)].filter((id) => refresh || !this.runtime.state.sessions.has(id));
    for (let start = 0; start < requested.length; start += organizationPolicy.pageSize) {
      if (!valid()) return;
      const observationRevision = this.runtime.state.beginSummaryRead();
      const result = await this.runtime.client.lookup(requested.slice(start, start + organizationPolicy.pageSize), signal);
      if (!valid()) return;
      this.runtime.clock.sample(result.serverNow); this.runtime.state.applySummaryRead(result.sessions, result.activity, result.missingSessionIds, observationRevision);
    }
  }
}
