import type { HermesV2Organize, HermesV2Organization, HermesV2OrganizationMutation, HermesV2Reorder } from "@wrapt/contracts/hermes-v2";
import { BoundRegistry } from "./evidence.js";
import { OrganizationError } from "./errors.js";
import { organizationPolicy } from "./policy.js";
import { organizationView, metadataFields } from "./views.js";
import type { MetadataRow, OrganizationRepository } from "./repository.js";

export class OrganizationConflict extends OrganizationError {
  constructor(readonly items: HermesV2Organization[], readonly pinRevision: number, readonly serverNow: number) {
    super(409, "ORGANIZATION_CONFLICT", "Die Organisation wurde inzwischen geändert. Bitte neu laden.");
  }
}
interface UndoRecord { before: MetadataRow[]; after: number[]; pinRevision: number | null }
export class OrganizationActions {
  private readonly undo: BoundRegistry<UndoRecord>;
  constructor(private repo: OrganizationRepository, private hasRequests: (scope: string, session: string) => boolean, private now = Date.now) {
    this.undo = new BoundRegistry(organizationPolicy.undoTtlMs, organizationPolicy.undoPerOwner, organizationPolicy.undoTotal, now);
  }
  clear(): void { this.undo.clear(); }
  private conflict(owner: string, scope: string, sessions: string[]): never {
    throw new OrganizationConflict(sessions.map((id) => organizationView(this.repo, owner, scope, id, this.now())), this.repo.lists(owner, scope).revision, this.now());
  }
  action(owner: string, scope: string, input: HermesV2Organize): HermesV2OrganizationMutation {
    const now = this.now();
    const result = this.repo.transaction(() => {
      const row = this.repo.metadata(owner, scope, input.sessionId, now);
      if (row.revision !== input.expectedRevision) this.conflict(owner, scope, [input.sessionId]);
      const pins = input.action === "pin" || input.action === "unpin";
      if (input.action === "pin") {
        const pinned = this.repo.all<{ session_id: string; pin_rank: number }>("SELECT session_id,pin_rank FROM hermes_v2_session_metadata WHERE owner_id=? AND scope=? AND pin_rank IS NOT NULL", owner, scope);
        if (row.pin_rank === null && pinned.length >= organizationPolicy.maxPins) throw new OrganizationError(400, "PIN_LIMIT", "Die Pin-Liste ist voll.");
        const rank = row.pin_rank ?? pinned.reduce((max, entry) => Math.max(max, entry.pin_rank + 1), 0);
        this.update(owner, scope, row.session_id, { ...metadataFields(row), pin_rank: rank });
      } else if (input.action === "unpin") this.update(owner, scope, row.session_id, { ...metadataFields(row), pin_rank: null });
      else {
        const fields = metadataFields(row);
        if (input.action === "snooze") {
          if (input.snoozedUntil <= now || input.snoozedUntil > now + organizationPolicy.snoozeMaxMs) throw new OrganizationError(400, "INVALID_SNOOZE", "Die Snooze-Zeit muss innerhalb des nächsten Jahres liegen.");
          if (this.hasRequests(scope, row.session_id)) throw new OrganizationError(409, "OPEN_REQUEST", "Eine offene Hermes-Anfrage kann nicht zurückgestellt werden.");
          fields.snoozed_at = now; fields.snoozed_until = input.snoozedUntil; fields.settled_at = null;
        } else if (input.action === "settle") {
          fields.snoozed_at = null; fields.snoozed_until = null; fields.settled_at = now;
        } else { fields.snoozed_at = null; fields.snoozed_until = null; fields.settled_at = null; }
        // Organisationsgrenze, niemals Lesebeleg: auch später bewiesene Aliase alter Fakten bleiben alt.
        fields.organization_cursor = this.repo.one<{ value: number }>(`SELECT COALESCE(MAX(f.change_cursor),0) value FROM hermes_v2_attention_facts f JOIN hermes_v2_sources s ON s.id=f.source_id WHERE s.scope=?`, scope)!.value;
        fields.organization_coverage_revision = this.repo.coverage(scope, row.session_id).revision;
        this.update(owner, scope, row.session_id, fields);
      }
      this.repo.touch(owner, scope, row.session_id, now, pins);
      return this.capture(owner, scope, [row], pins);
    });
    return this.result(owner, scope, result);
  }
  reorder(owner: string, scope: string, input: HermesV2Reorder): HermesV2OrganizationMutation {
    const result = this.repo.transaction(() => {
      const rows = this.repo.all<MetadataRow>("SELECT * FROM hermes_v2_session_metadata WHERE owner_id=? AND scope=? AND pin_rank IS NOT NULL ORDER BY pin_rank,session_id", owner, scope);
      const ids = input.entries.map((entry) => entry.sessionId);
      if (this.repo.lists(owner, scope).revision !== input.expectedPinRevision || ids.length !== rows.length || new Set(ids).size !== ids.length
        || rows.some((row) => !input.entries.some((entry) => entry.sessionId === row.session_id && entry.expectedRevision === row.revision))) this.conflict(owner, scope, rows.map((row) => row.session_id));
      input.entries.forEach((entry, index) => {
        this.repo.run("UPDATE hermes_v2_session_metadata SET pin_rank=? WHERE owner_id=? AND scope=? AND session_id=?", index, owner, scope, entry.sessionId);
        this.repo.touch(owner, scope, entry.sessionId, this.now(), true);
      });
      return this.capture(owner, scope, rows, true);
    });
    return this.result(owner, scope, result);
  }
  restore(owner: string, scope: string, handle: string): HermesV2OrganizationMutation {
    const undo = this.undo.get(handle, owner, scope);
    this.repo.transaction(() => {
      const rows = undo.before;
      if ((undo.pinRevision !== null && this.repo.lists(owner, scope).revision !== undo.pinRevision)
        || rows.some((row, index) => this.repo.metadata(owner, scope, row.session_id, this.now()).revision !== undo.after[index])) this.conflict(owner, scope, rows.map((row) => row.session_id));
      for (const row of rows) {
        this.update(owner, scope, row.session_id, metadataFields(row));
        this.repo.touch(owner, scope, row.session_id, this.now(), undo.pinRevision !== null);
      }
    });
    this.undo.remove(handle);
    return { items: undo.before.map((row) => organizationView(this.repo, owner, scope, row.session_id, this.now())), undo: null, serverNow: this.now() };
  }
  private update(owner: string, scope: string, session: string, fields: ReturnType<typeof metadataFields>): void {
    this.repo.run(`UPDATE hermes_v2_session_metadata SET pin_rank=?,snoozed_at=?,snoozed_until=?,settled_at=?,organization_cursor=?,organization_coverage_revision=? WHERE owner_id=? AND scope=? AND session_id=?`,
      fields.pin_rank, fields.snoozed_at, fields.snoozed_until, fields.settled_at, fields.organization_cursor, fields.organization_coverage_revision, owner, scope, session);
  }
  private capture(owner: string, scope: string, before: MetadataRow[], pins: boolean): UndoRecord {
    return { before, after: before.map((row) => this.repo.metadata(owner, scope, row.session_id, this.now()).revision), pinRevision: pins ? this.repo.lists(owner, scope).revision : null };
  }
  private result(owner: string, scope: string, record: UndoRecord): HermesV2OrganizationMutation {
    return { items: record.before.map((row) => organizationView(this.repo, owner, scope, row.session_id, this.now())),
      undo: this.undo.issue(owner, scope, "", record), serverNow: this.now() };
  }
}
