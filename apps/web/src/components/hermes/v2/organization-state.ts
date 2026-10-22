import type { HermesV2Activity, HermesV2Session } from "@wrapt/contracts/hermes-v2";
import type { MemberShelf, SidebarOrganization, SidebarRowView } from "./sidebar-types";
import { organizationPolicy } from "./organization-policy";
import { resolveSidebarRow } from "./sidebar-resolver";

export interface MembershipState {
  ids: string[];
  cursor: string | null;
  hasMore: boolean;
  complete: boolean;
  loading: boolean;
  revision: number | null;
  pinRevision: number;
}
export const emptyMembership = (): MembershipState => ({ ids: [], cursor: null, hasMore: true, complete: false, loading: false, revision: null, pinRevision: 0 });
export class OrganizationState {
  readonly sessions = new Map<string, HermesV2Session>();
  readonly activity = new Map<string, HermesV2Activity>();
  readonly metadata = new Map<string, SidebarOrganization>();
  /**
   * Bestaetigte Projektzuordnung je Sitzung. Sie entsteht in einem
   * Projektkontext und gilt danach fuer alle Spalten, damit der
   * Projektfilter auch im allgemeinen Kontext eine Auswahl anbietet.
   */
  readonly confirmedProjects = new Map<string, { projectId: string; locationRevision: number }>();
  readonly members: Record<MemberShelf, MembershipState> = { pinned: emptyMembership(), snoozed: emptyMembership(), settled: emptyMembership() };
  pinRevision = 0;
  membershipInvalidation = 0;
  overflowed = false;
  observationRevision = 0;
  private summaryRevisions = new Map<string, number>();
  private locationRevisions = new Map<string, number>();
  private forgotten = new Set<string>();
  private rowCache = new Map<string, { session: HermesV2Session | null; activity: HermesV2Activity | null;
    metadata: SidebarOrganization; bucket: number; row: SidebarRowView }>();
  mergeMetadata(items: readonly SidebarOrganization[], certifyingGroup?: MemberShelf): void {
    let invalidates = false;
    for (const item of items) {
      if (!this.sessions.has(item.sessionId) && this.forgotten.has(item.sessionId)) continue;
      const previous = this.metadata.get(item.sessionId);
      if (previous && previous.revision > item.revision) continue;
      if (!previous && this.metadata.size >= organizationPolicy.maxCachedSessions) { this.overflowed = true; continue; }
      invalidates ||= item.pinRevision > this.pinRevision || (previous ? previous.revision !== item.revision
        : item.revision > 0 || item.pinRank !== null || item.snoozedUntil !== null || item.settledAt !== null);
      this.metadata.set(item.sessionId, item);
      this.pinRevision = Math.max(this.pinRevision, item.pinRevision);
    }
    if (invalidates) this.invalidateMembers(certifyingGroup);
  }
  invalidateMembers(certifyingGroup?: MemberShelf): void {
    this.membershipInvalidation++;
    for (const group of ["pinned", "snoozed", "settled"] as const) {
      // Eigene Seitenmetadaten dürfen ihren noch offenen Fehlercursor behalten.
      if (group === certifyingGroup) continue;
      this.members[group].complete = false; this.members[group].hasMore = false;
    }
  }
  advancePinRevision(revision: number, certifyingGroup?: MemberShelf): void {
    if (revision <= this.pinRevision) return;
    this.pinRevision = revision; this.invalidateMembers(certifyingGroup);
  }
  markNative(id: string): void {
    this.acceptObservation(id, ++this.observationRevision);
  }
  beginSummaryRead(): number { return ++this.observationRevision; }
  locationRevision(id: string): number { return this.locationRevisions.get(id) ?? 0; }
  private acceptObservation(id: string, revision: number): boolean {
    if ((this.summaryRevisions.get(id) ?? 0) > revision) return false;
    if (!this.summaryRevisions.has(id) && this.summaryRevisions.size >= organizationPolicy.maxCachedSessions) {
      this.overflowed = true;
      return false;
    }
    this.summaryRevisions.set(id, revision);
    return true;
  }
  mergeSessions(items: readonly HermesV2Session[], activity: Record<string, HermesV2Activity> = {}, readRevision = this.observationRevision): void {
    for (const item of items) {
      if (!this.acceptObservation(item.id, readRevision)) continue;
      if (!this.sessions.has(item.id) && this.sessions.size >= organizationPolicy.maxCachedSessions) { this.overflowed = true; continue; }
      const previous = this.sessions.get(item.id);
      this.forgotten.delete(item.id);
      if (previous && previous.cwd !== item.cwd) this.locationRevisions.set(item.id, readRevision);
      this.sessions.set(item.id, item);
    }
    for (const [id, value] of Object.entries(activity)) {
      if (!this.acceptObservation(id, readRevision)) continue;
      if (this.activity.has(id) || this.activity.size < organizationPolicy.maxCachedSessions) this.activity.set(id, value);
    }
  }
  applySummaryRead(items: readonly HermesV2Session[], activity: Record<string, HermesV2Activity>, missingIds: readonly string[], revision: number): void {
    this.mergeSessions(items, activity, revision);
    for (const item of items) {
      if (!Object.hasOwn(activity, item.id) && this.acceptObservation(item.id, revision)) this.activity.delete(item.id);
    }
    for (const id of missingIds) {
      if (!this.acceptObservation(id, revision)) continue;
      this.locationRevisions.set(id, revision);
      this.sessions.delete(id);
      this.activity.delete(id);
      this.rowCache.delete(id);
    }
  }
  rows(ids: Iterable<string>, now: number): SidebarRowView[] {
    const rows: SidebarRowView[] = [];
    for (const id of new Set(ids)) {
      const metadata = this.metadata.get(id);
      if (!metadata) continue;
      const session = this.sessions.get(id) ?? null;
      const activity = this.activity.get(id) ?? null;
      const timed = activity?.turnStartedAt !== null && (activity?.state === "working" || activity?.state === "starting");
      const bucket = timed ? Math.floor(now / organizationPolicy.workingTickMs) : metadata.effectiveSnoozedUntil !== null && metadata.effectiveSnoozedUntil <= now ? 1 : 0;
      const cached = this.rowCache.get(id);
      if (cached && cached.session === session && cached.activity === activity && cached.metadata === metadata && cached.bucket === bucket) rows.push(cached.row);
      else {
        const row = resolveSidebarRow(session, metadata, activity, now);
        this.rowCache.set(id, { session, activity, metadata, bucket, row }); rows.push(row);
      }
    }
    return rows;
  }
  resetMembers(group: MemberShelf): void { this.members[group] = emptyMembership(); }
  forgetDeletedSessions(ids: readonly string[]): void {
    const revision = ++this.observationRevision;
    for (const id of ids) {
      if (this.forgotten.size < organizationPolicy.maxCachedSessions) this.forgotten.add(id);
      else this.overflowed = true;
      if (this.summaryRevisions.has(id) || this.summaryRevisions.size < organizationPolicy.maxCachedSessions) this.summaryRevisions.set(id, revision);
      this.sessions.delete(id); this.activity.delete(id); this.metadata.delete(id); this.rowCache.delete(id);
      this.locationRevisions.delete(id);
    }
    const removed = new Set(ids);
    for (const member of Object.values(this.members)) member.ids = member.ids.filter((id) => !removed.has(id));
    this.invalidateMembers();
  }
  clear(): void {
    this.sessions.clear(); this.activity.clear(); this.metadata.clear(); this.rowCache.clear(); this.pinRevision = 0; this.membershipInvalidation = 0; this.overflowed = false;
    this.summaryRevisions.clear(); this.locationRevisions.clear(); this.observationRevision = 0;
    this.forgotten.clear();
    for (const group of ["pinned", "snoozed", "settled"] as const) this.resetMembers(group);
  }
}
