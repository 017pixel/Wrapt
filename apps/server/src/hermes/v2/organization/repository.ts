import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { HermesV2Fact } from "@wrapt/contracts/hermes-v2";
import { organizationSchema } from "./schema.js";
import { equalSourceIds } from "./equality.js";

export interface MetadataRow {
  owner_id: string; scope: string; session_id: string; revision: number; pin_rank: number | null;
  snoozed_at: number | null; snoozed_until: number | null; settled_at: number | null;
  organization_cursor: number; organization_coverage_revision: number; updated_at: number;
}
export interface SourceRow {
  id: string; scope: string; session_id: string; namespace: "answer" | "error"; source_key: string;
  uid: string | null; row_id: number | null; epoch: string | null; live_id: string | null; seq: number | null; available: number; availability_revision: number;
}
export interface FactRow extends SourceRow {
  fact_id: string; kind: HermesV2Fact["kind"]; change_cursor: number; observed_at: number; completed_at: number | null;
}
export interface CoverageRow {
  scope: string; session_id: string; anchor: string | null; known_sources: string;
  state: "baseline" | "anchored" | "gap" | "identity-unknown"; revision: number; reason: string | null; signature: string | null;
}
export class OrganizationRepository {
  private database: DatabaseSync | null = null;
  private changes = new Map<string, { owner: string; session: string; revision: number }>();
  constructor(private path: string, private notify: (owner: string, session: string, revision: number) => void, private now = Date.now) {}
  get db(): DatabaseSync {
    if (!this.database) {
      mkdirSync(dirname(this.path), { recursive: true });
      this.database = new DatabaseSync(this.path);
      this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
      this.database.exec(organizationSchema);
    }
    return this.database;
  }
  get opened(): boolean { return this.database !== null; }
  close(): void { this.database?.close(); this.database = null; }
  one<T>(sql: string, ...values: SQLInputValue[]): T | undefined { return this.db.prepare(sql).get(...values) as T | undefined; }
  all<T>(sql: string, ...values: SQLInputValue[]): T[] { return this.db.prepare(sql).all(...values) as unknown as T[]; }
  run(sql: string, ...values: SQLInputValue[]): void { this.db.prepare(sql).run(...values); }
  transaction<T>(work: () => T): T {
    if (this.db.isTransaction) return work();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      const changes = [...this.changes.values()];
      this.changes.clear();
      for (const change of changes) {
        try { this.notify(change.owner, change.session, change.revision); }
        catch { /* Ein bereits bestätigter Commit bleibt auch bei fehlgeschlagener UI-Ausgabe bestätigt. */ }
      }
      return result;
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      this.changes.clear();
      throw error;
    }
  }
  metadata(owner: string, scope: string, session: string, now: number): MetadataRow {
    this.run("INSERT OR IGNORE INTO hermes_v2_session_metadata(owner_id,scope,session_id,updated_at) VALUES(?,?,?,?)", owner, scope, session, now);
    this.run("INSERT OR IGNORE INTO hermes_v2_pin_lists(owner_id,scope) VALUES(?,?)", owner, scope);
    return this.one<MetadataRow>("SELECT * FROM hermes_v2_session_metadata WHERE owner_id=? AND scope=? AND session_id=?", owner, scope, session)!;
  }
  lists(owner: string, scope: string): { revision: number; membership_revision: number } {
    return this.one("SELECT revision,membership_revision FROM hermes_v2_pin_lists WHERE owner_id=? AND scope=?", owner, scope) ?? { revision: 0, membership_revision: 0 };
  }
  touch(owner: string, scope: string, session: string, now: number, pins = false): void {
    this.metadata(owner, scope, session, now);
    this.run("UPDATE hermes_v2_session_metadata SET revision=revision+1,updated_at=? WHERE owner_id=? AND scope=? AND session_id=?", now, owner, scope, session);
    this.run("UPDATE hermes_v2_pin_lists SET membership_revision=membership_revision+1,revision=revision+? WHERE owner_id=? AND scope=?", pins ? 1 : 0, owner, scope);
    const revision = this.metadata(owner, scope, session, now).revision;
    this.changes.set(`${owner}\0${scope}\0${session}`, { owner, session, revision });
  }
  sharedTouch(scope: string, session: string, now: number): void {
    for (const row of this.all<{ owner_id: string }>("SELECT owner_id FROM hermes_v2_session_metadata WHERE scope=? AND session_id=?", scope, session)) this.touch(row.owner_id, scope, session, now);
  }
  sourceTouch(source: SourceRow, now: number): void {
    for (const row of this.sourceSessions(source.id)) this.sharedTouch(row.scope, row.session_id, now);
  }
  sourceSessions(source: string): Array<{ scope: string; session_id: string }> {
    return this.all(`SELECT DISTINCT scope,session_id FROM hermes_v2_source_sessions WHERE source_id IN (${equalSourceIds("?")})`, source);
  }
  context(scope: string, session: string): string {
    return this.one<{ root_id: string }>("SELECT root_id FROM hermes_v2_session_contexts WHERE scope=? AND session_id=?", scope, session)?.root_id ?? session;
  }
  coverage(scope: string, session: string): CoverageRow {
    return this.one<CoverageRow>("SELECT * FROM hermes_v2_reconciliation WHERE scope=? AND session_id=?", scope, session)
      ?? { scope, session_id: session, anchor: null, known_sources: "[]", state: "baseline", revision: 0, reason: null, signature: null };
  }
  setCoverage(scope: string, session: string, state: CoverageRow["state"], reason: string | null, signature: string | null, now: number): void {
    const before = this.coverage(scope, session);
    const changed = before.state !== state || before.reason !== reason
      || ((state === "gap" || state === "identity-unknown" || reason === "CONTENT_AVAILABLE") && before.signature !== signature);
    const wakes = changed && (state === "gap" || state === "identity-unknown" || reason === "CONTENT_AVAILABLE");
    this.run(`INSERT INTO hermes_v2_reconciliation(scope,session_id,state,revision,reason,signature) VALUES(?,?,?,?,?,?)
      ON CONFLICT(scope,session_id) DO UPDATE SET state=excluded.state,revision=excluded.revision,reason=excluded.reason,signature=excluded.signature`,
    scope, session, state, before.revision + (wakes ? 1 : 0), reason, signature);
    if (changed) this.sharedTouch(scope, session, now);
  }
  facts(scope: string, session: string, limit = 1000): FactRow[] {
    return this.all(`SELECT s.*,f.id fact_id,f.kind,f.change_cursor,f.observed_at,f.completed_at
      FROM hermes_v2_attention_facts f JOIN hermes_v2_sources s ON s.id=f.source_id
      JOIN hermes_v2_source_sessions ss ON ss.source_id=s.id
      WHERE ss.scope=? AND ss.session_id=? ORDER BY f.change_cursor DESC LIMIT ?`, scope, session, limit);
  }
  acknowledged(owner: string, sourceId: string): boolean {
    return !!this.one(`SELECT 1 FROM hermes_v2_read_acks a WHERE a.owner_id=? AND a.source_id IN (${equalSourceIds("?")}) LIMIT 1`, owner, sourceId);
  }
  source(scope: string, session: string, namespace: SourceRow["namespace"], key: string, patch: Partial<SourceRow> = {}): SourceRow {
    const context = this.context(scope, session);
    const known = this.one<SourceRow>(`SELECT s.* FROM hermes_v2_sources s LEFT JOIN hermes_v2_session_contexts c
      ON c.scope=s.scope AND c.session_id=s.session_id WHERE s.scope=? AND COALESCE(c.root_id,s.session_id)=? AND s.namespace=? AND s.source_key=? LIMIT 1`, scope, context, namespace, key);
    if (known) {
      const associated = this.one("SELECT 1 FROM hermes_v2_source_sessions WHERE source_id=? AND scope=? AND session_id=?", known.id, scope, session);
      this.run("INSERT OR IGNORE INTO hermes_v2_source_sessions VALUES(?,?,?)", known.id, scope, session);
      if (!associated && this.one("SELECT 1 FROM hermes_v2_attention_facts WHERE source_id=?", known.id)) this.sharedTouch(scope, session, this.now());
      return known;
    }
    const source: SourceRow = { id: randomUUID(), scope, session_id: session, namespace, source_key: key, uid: null,
      row_id: null, epoch: null, live_id: null, seq: null, available: 1, availability_revision: 0, ...patch };
    this.run("INSERT INTO hermes_v2_sources VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", source.id, scope, session, namespace, key,
      source.uid, source.row_id, source.epoch, source.live_id, source.seq, source.available, source.availability_revision);
    this.run("INSERT OR IGNORE INTO hermes_v2_source_sessions VALUES(?,?,?)", source.id, scope, session);
    return source;
  }
  fact(source: SourceRow, kind: HermesV2Fact["kind"], now: number, completedAt: number | null = null): void {
    const known = this.one<{ kind: string; source_id: string }>(`SELECT kind,source_id FROM hermes_v2_attention_facts WHERE source_id IN (${equalSourceIds("?")}) ORDER BY change_cursor LIMIT 1`, source.id);
    if (known) {
      this.run("INSERT OR IGNORE INTO hermes_v2_source_sessions SELECT ?,scope,session_id FROM hermes_v2_source_sessions WHERE source_id=?", known.source_id, source.id);
      if (known.kind === "new-answer" && kind === "live-turn-end") {
        this.run("UPDATE hermes_v2_attention_facts SET kind=? WHERE source_id=?", kind, known.source_id);
        this.sourceTouch(source, now);
      }
      return;
    }
    this.run("INSERT INTO hermes_v2_attention_facts(id,source_id,kind,observed_at,completed_at) VALUES(?,?,?,?,?)", randomUUID(), source.id, kind, now, completedAt);
    this.sourceTouch(source, now);
  }
  markAvailable(source: SourceRow, now: number): void {
    if (source.available !== 0) return;
    this.run(`UPDATE hermes_v2_sources SET available=1 WHERE id IN (${equalSourceIds("?")})`, source.id);
    for (const session of this.sourceSessions(source.id)) {
      this.setCoverage(session.scope, session.session_id, "anchored", "CONTENT_AVAILABLE", source.id, now);
      const revision = this.coverage(session.scope, session.session_id).revision;
      // Revisionszahlen verschiedener Sessionprojektionen sind nicht miteinander vergleichbar.
      this.run(`INSERT INTO hermes_v2_source_availability(source_id,scope,session_id,revision)
        SELECT source_id,scope,session_id,? FROM hermes_v2_source_sessions
        WHERE scope=? AND session_id=? AND source_id IN (${equalSourceIds("?")})
        ON CONFLICT(source_id,scope,session_id) DO UPDATE SET revision=excluded.revision`, revision, session.scope, session.session_id, source.id);
    }
  }
}
