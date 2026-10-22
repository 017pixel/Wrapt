import { randomBytes } from "node:crypto";
import type { HermesV2Attachment, HermesV2Message, HermesV2UploadStatus } from "@wrapt/contracts/hermes-v2";
import type { OrganizationRepository } from "../organization/repository.js";
import { GatewayError } from "../errors.js";
import { attachmentPolicy as p } from "./policy.js";
import type { AttachmentBinding } from "./binding.js";

export interface AttachmentRow {
  id: string; owner: string; scope: string; upload_id: string; stored_id: string; canonical: string;
  live: string; epoch: string; cwd: string; state: HermesV2UploadStatus["state"]; revision: number;
  name: string; mime: string; bytes: number; path: string | null; root: string | null;
  fingerprint: string | null; reference: string | null; created_at: number; expires_at: number;
  user_row: number | null;
}
const schema = `CREATE TABLE IF NOT EXISTS hermes_v2_attachments (
 id TEXT PRIMARY KEY,owner TEXT NOT NULL,scope TEXT NOT NULL,upload_id TEXT NOT NULL,stored_id TEXT NOT NULL,
 canonical TEXT NOT NULL,live TEXT NOT NULL,epoch TEXT NOT NULL,cwd TEXT NOT NULL,state TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,name TEXT NOT NULL,mime TEXT NOT NULL,bytes INTEGER NOT NULL DEFAULT 0,
 path TEXT,root TEXT,fingerprint TEXT,reference TEXT,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,user_row INTEGER,
 UNIQUE(owner,upload_id)) STRICT;
 CREATE INDEX IF NOT EXISTS hermes_v2_attachment_rows ON hermes_v2_attachments(owner,scope,canonical,user_row);
 CREATE TABLE IF NOT EXISTS hermes_v2_attachment_messages (
 attachment_id TEXT NOT NULL REFERENCES hermes_v2_attachments(id) ON DELETE CASCADE,
 user_row INTEGER NOT NULL,logical_uid TEXT,PRIMARY KEY(attachment_id,user_row)) STRICT;`;
export class AttachmentStore {
  private initialized = false;
  constructor(private repo: OrganizationRepository, private now = Date.now) {}
  private ensure(): void {
    if (!this.initialized) {
      this.repo.db.exec(schema);
      this.repo.run("UPDATE hermes_v2_attachments SET state='unknown',revision=revision+1 WHERE state='receiving'");
      this.initialized = true;
    }
  }
  get(owner: string, upload: string): AttachmentRow | undefined {
    this.ensure(); return this.repo.one("SELECT * FROM hermes_v2_attachments WHERE owner=? AND upload_id=?", owner, upload);
  }
  byId(owner: string, scope: string, id: string): AttachmentRow {
    this.ensure();
    const row = this.repo.one<AttachmentRow>("SELECT * FROM hermes_v2_attachments WHERE id=? AND owner=? AND scope=?", id, owner, scope);
    if (!row || row.expires_at <= this.now() || row.state !== "ready") throw new GatewayError("SESSION_NOT_FOUND", "Dieser Anhang ist nicht verfügbar.");
    return row;
  }
  reserve(owner: string, upload: string, binding: AttachmentBinding, name: string, mime: string): { row: AttachmentRow; fresh: boolean } {
    this.ensure();
    return this.repo.transaction(() => {
      const known = this.get(owner, upload);
      if (known) {
        if (known.scope !== binding.scope.id || known.stored_id !== binding.record.storedId || known.canonical !== binding.canonical
          || known.live !== binding.live || known.epoch !== binding.epoch || known.cwd !== binding.cwd)
          throw new GatewayError("STALE_REQUEST", "Die Upload-ID gehört zu einem anderen Kontext.");
        return { row: known, fresh: false };
      }
      this.repo.run("DELETE FROM hermes_v2_attachments WHERE expires_at<=?", this.now());
      const count = this.repo.one<{ total: number; own: number; pending: number; own_pending: number }>(`SELECT COUNT(*) total,
        COALESCE(SUM(owner=?),0) own,COALESCE(SUM(state='receiving'),0) pending,
        COALESCE(SUM(owner=? AND state='receiving'),0) own_pending FROM hermes_v2_attachments`, owner, owner)!;
      if (count.total >= p.recordsTotal || count.own >= p.recordsOwner || count.pending >= p.pendingTotal || count.own_pending >= p.pendingOwner)
        throw new GatewayError("RATE_LIMITED", "Die Anhangskapazität ist ausgeschöpft.");
      const id = randomBytes(32).toString("hex");
      this.repo.run(`INSERT INTO hermes_v2_attachments(id,owner,scope,upload_id,stored_id,canonical,live,epoch,cwd,state,name,mime,created_at,expires_at)
        VALUES(?,?,?,?,?,?,?,?,?,'receiving',?,?,?,?)`, id, owner, binding.scope.id, upload, binding.record.storedId,
      binding.canonical, binding.live, binding.epoch, binding.cwd, name, mime, this.now(), this.now() + p.unusedMs);
      return { row: this.get(owner, upload)!, fresh: true };
    });
  }
  ready(row: AttachmentRow, bytes: number, path: string, root: string, fingerprint: string, reference: string): void {
    this.repo.transaction(() => {
      const current = this.get(row.owner, row.upload_id);
      if (!current || current.revision !== row.revision || current.state !== "receiving") throw new GatewayError("STALE_REQUEST", "Der Uploadzustand hat sich geändert.");
      this.repo.run("UPDATE hermes_v2_attachments SET state='ready',revision=revision+1,bytes=?,path=?,root=?,fingerprint=?,reference=? WHERE id=? AND revision=? AND state='receiving'",
        bytes, path, root, fingerprint, reference, row.id, row.revision);
    });
  }
  fail(row: AttachmentRow, state: "not_sent"|"unknown"): void {
    this.repo.run("UPDATE hermes_v2_attachments SET state=?,revision=revision+1 WHERE id=? AND revision=? AND state='receiving'", state, row.id, row.revision);
  }
  used(owner: string, ids: readonly string[], userRow: number | null): void {
    this.repo.transaction(() => {
      for (const id of ids) {
        this.repo.run("UPDATE hermes_v2_attachments SET user_row=COALESCE(?,user_row),expires_at=?,revision=revision+1 WHERE id=? AND owner=? AND state='ready'", userRow, this.now() + p.usedMs, id, owner);
        if (userRow !== null) this.repo.run(`INSERT OR IGNORE INTO hermes_v2_attachment_messages(attachment_id,user_row)
          SELECT id,? FROM hermes_v2_attachments WHERE id=? AND owner=? AND state='ready'`, userRow, id, owner);
      }
    });
  }
  public(row: AttachmentRow): HermesV2Attachment {
    return { id: row.id, name: row.name, bytes: row.bytes, mime: row.mime, kind: "file-reference", expiresAt: row.expires_at };
  }
  status(row: AttachmentRow): HermesV2UploadStatus {
    return { uploadId: row.upload_id, state: row.state, attachment: row.state === "ready" && row.expires_at > this.now() ? this.public(row) : null };
  }
  history(owner: string, scope: string, canonical: string, rows: readonly HermesV2Message[]): void {
    this.ensure();
    for (const row of rows) if (row.role === "user" && row.rowId) {
      const files = this.repo.all<AttachmentRow>(`SELECT a.* FROM hermes_v2_attachments a JOIN hermes_v2_attachment_messages m ON m.attachment_id=a.id
        WHERE a.owner=? AND a.scope=? AND a.canonical=? AND m.user_row=? AND a.state='ready' AND a.expires_at>?
        AND (m.logical_uid IS NULL OR m.logical_uid=?) LIMIT 10`, owner, scope, canonical, row.rowId, this.now(), row.logicalId ?? "");
      if (row.logicalId) for (const file of files) this.repo.run("UPDATE hermes_v2_attachment_messages SET logical_uid=? WHERE attachment_id=? AND user_row=? AND logical_uid IS NULL", row.logicalId, file.id, row.rowId);
      if (files.length) row.attachments = files.map((file) => this.public(file));
    }
  }
}
