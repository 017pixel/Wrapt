import { z } from "zod";
import { logicalId } from "../history-identities.js";
import { object } from "../normalize-values.js";
import type { DashboardReader } from "../types.js";
import type { OrganizationRepository } from "./repository.js";
import type { OrganizationScope } from "./scope.js";
import { answerSource, terminalAnswer, terminalAnswerContent } from "./sources.js";
import { organizationPolicy } from "./policy.js";
import { confirmLineage } from "./lineage.js";
import { identityCoverage, recordMissingIdentity } from "./identity-coverage.js";

interface Dirty { scope: OrganizationScope; session: string }
export class OrganizationReconciler {
  private dirty = new Map<string, Dirty>();
  private workers = 0;
  private readonly inFlight = new Set<string>();
  private stopped = false;
  private again = false;
  constructor(private repo: OrganizationRepository, private dashboard: DashboardReader,
    private overflow: () => void, private now = Date.now, private active = () => true) {}
  stop(): void { this.stopped = true; this.dirty.clear(); }
  enqueue(scope: OrganizationScope, ids: readonly string[]): void {
    if (this.stopped) return;
    for (const session of ids) {
      const key = `${scope.id}:${session}`;
      if (!this.dirty.has(key) && this.dirty.size >= organizationPolicy.dirtySessions) {
        this.repo.transaction(() => this.repo.setCoverage(scope.id, session, "gap", "RECONCILIATION_OVERFLOW", "overflow", this.now()));
        this.again = true;
      } else this.dirty.set(key, { scope, session });
    }
    this.drain();
  }
  private drain(): void {
    while (!this.stopped && this.active() && this.workers < organizationPolicy.historyWorkers && this.dirty.size) {
      const entry = [...this.dirty].find(([key]) => !this.inFlight.has(key));
      if (!entry) break;
      const [key, work] = entry;
      this.dirty.delete(key);
      this.inFlight.add(key);
      this.workers++;
      void this.scan(work.scope, work.session).catch(() => {
        if (!this.stopped) this.repo.transaction(() => this.repo.setCoverage(work.scope.id, work.session, "gap", "HISTORY_UNAVAILABLE", "unavailable", this.now()));
      }).finally(() => {
        this.workers--;
        this.inFlight.delete(key);
        this.drain();
        if (!this.workers && !this.dirty.size && this.again && !this.stopped) { this.again = false; this.overflow(); }
      });
    }
  }
  async scan(scope: OrganizationScope, session: string): Promise<void> {
    const before = this.repo.coverage(scope.id, session);
    let rows = await this.page(scope, session, 0);
    if (this.stopped || !this.active()) return;
    if (before.anchor && !rows.some((row) => logicalId(object(row).message_uid) === before.anchor)) rows = [...await this.page(scope, session, 64), ...rows];
    if (this.stopped || !this.active()) return;
    this.repo.transaction(() => {
      const uids = rows.map((row) => logicalId(object(row).message_uid));
      const anchor = before.anchor ? uids.lastIndexOf(before.anchor) : -1;
      const missing = rows.map((row, index) => !uids[index] && terminalAnswerContent(row));
      const signature = rows.map((row, index) => {
        const id = object(row).id ?? object(row).row_id;
        const witness = typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : `position${index}`;
        return uids[index] ?? (missing[index] ? `missing:${witness}` : "");
      }).join(":");
      const sources = rows.map((row) => answerSource(this.repo, scope.id, session, row, this.now()));
      rows.forEach((row, index) => {
        if (missing[index]) recordMissingIdentity(this.repo, scope.id, session, object(row).id ?? object(row).row_id ?? object(row)._row_id, index);
      });
      const unresolved = this.repo.one(`SELECT 1 FROM hermes_v2_sources s JOIN hermes_v2_attention_facts f ON f.source_id=s.id JOIN hermes_v2_source_sessions ss ON ss.source_id=s.id
        WHERE ss.scope=? AND ss.session_id=? AND s.namespace='answer' AND s.uid IS NULL AND NOT EXISTS
        (SELECT 1 FROM hermes_v2_source_links WHERE kind='equal' AND (from_id=s.id OR to_id=s.id)) LIMIT 1`, scope.id, session);
      rows.forEach((row, index) => {
        const source = sources[index];
        const known = source && this.repo.one("SELECT 1 FROM hermes_v2_reconciled_sources WHERE scope=? AND session_id=? AND source_id=?", scope.id, session, source.id);
        if (source && before.anchor && anchor >= 0 && index > anchor && !known && terminalAnswer(row) && !unresolved) this.repo.fact(source, "new-answer", this.now());
        if (source) this.repo.run("INSERT OR IGNORE INTO hermes_v2_reconciled_sources VALUES(?,?,?)", scope.id, session, source.id);
      });
      const hasIdentity = uids.some((uid) => uid !== null);
      const identity = identityCoverage(this.repo, scope.id, session);
      const state = identity.conflicts > 0 || missing.some(Boolean) || (!hasIdentity && rows.length > 0) ? "identity-unknown" : before.anchor && anchor < 0 ? "gap" : unresolved ? "gap" : before.anchor ? "anchored" : "baseline";
      const reason = state === "gap" ? unresolved ? "UNRESOLVED_LIVE_OVERLAP" : "ANCHOR_MISSING"
        : state === "identity-unknown" ? identity.conflicts > 0 ? "ROW_IDENTITY_CHANGED" : "MESSAGE_IDENTITY_MISSING" : null;
      this.repo.setCoverage(scope.id, session, state, reason, state === "identity-unknown" ? identity.signature : signature, this.now());
      const nextAnchor = state === "gap" || state === "identity-unknown" ? before.anchor : uids.filter((uid) => uid !== null).at(-1) ?? before.anchor;
      this.repo.run("UPDATE hermes_v2_reconciliation SET anchor=?,known_sources=? WHERE scope=? AND session_id=?", nextAnchor,
        JSON.stringify(sources.filter((source) => source !== null).map((source) => source.id).slice(-organizationPolicy.maxKnownSources)), scope.id, session);
    });
  }
  private async page(scope: OrganizationScope, session: string, offset: number): Promise<unknown[]> {
    const params = new URLSearchParams({ profile: scope.profile, limit: "64", offset: String(offset), order: "latest", inline_images: "false" });
    const raw = z.object({ session_id: z.string(), profile: z.string(), messages: z.array(z.unknown()).max(64) }).parse(await this.dashboard.get(`/api/sessions/${encodeURIComponent(session)}/messages?${params}`));
    if (raw.profile !== scope.profile) throw new Error("Unbestätigte Profilprojektion");
    if (raw.session_id !== session && this.repo.context(scope.id, raw.session_id) !== this.repo.context(scope.id, session)) {
      const chain = z.object({ requested_session_id: z.string(), session_id: z.string(), path: z.array(z.string()).max(1000) })
        .parse(await this.dashboard.get(`/api/sessions/${encodeURIComponent(session)}/latest-descendant?profile=${encodeURIComponent(scope.profile)}`));
      if (chain.requested_session_id !== session || chain.session_id !== raw.session_id || chain.path[0] !== session || chain.path.at(-1) !== raw.session_id) throw new Error("Unbestätigte Sessionprojektion");
      const root = this.repo.context(scope.id, session);
      confirmLineage(this.repo, scope.id, { id: raw.session_id, _lineage_root_id: root, _lineage_ids: root === session ? chain.path : [root, ...chain.path] }, this.now());
    }
    return raw.messages;
  }
}
