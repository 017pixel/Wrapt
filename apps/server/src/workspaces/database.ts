import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  workspaceRegistrySnapshotSchema,
  type WorkspaceRegistrySnapshot,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

interface RegistryRow { documentJson: string; revision: number; updatedAt: string; }

const EMPTY_REGISTRY: WorkspaceRegistrySnapshot = { entries: [], changedAt: {}, deletedAt: {} };

/**
 * Das Workspace-Register eines Benutzers: welche Server (Origins) er in
 * Wrapt verbunden hat. Liegt pro Benutzer auf jedem Server und wird vom
 * Browser beim Wechsel zwischen Servern zusammengeführt — so sieht jedes
 * Gerät denselben Stand, egal wo ein Server hinzugefügt wurde.
 */
export class WorkspaceRegistryDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_registries (
        owner_id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  close() { this.db.close(); }

  getRegistry(userId: string) {
    const row = this.db.prepare(
      "SELECT document_json documentJson, revision, updated_at updatedAt FROM workspace_registries WHERE owner_id = ?",
    ).get(userId) as RegistryRow | undefined;
    if (!row) return { document: EMPTY_REGISTRY, revision: 0, updatedAt: new Date(0).toISOString() };
    return {
      document: workspaceRegistrySnapshotSchema.parse(JSON.parse(row.documentJson) as unknown),
      revision: row.revision,
      updatedAt: row.updatedAt,
    };
  }

  saveRegistry(userId: string, document: WorkspaceRegistrySnapshot, expectedRevision: number | null) {
    const parsed = workspaceRegistrySnapshotSchema.parse(document);
    let revision: number;
    let updatedAt: string;
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Revision und Dokument unter derselben Schreibsperre lesen und
      // schreiben, sonst überschreibt ein zweites Gerät still die Änderung
      // des ersten.
      const row = this.db.prepare(
        "SELECT revision FROM workspace_registries WHERE owner_id = ?",
      ).get(userId) as Pick<RegistryRow, "revision"> | undefined;
      const currentRevision = row?.revision ?? 0;
      if (expectedRevision !== null && expectedRevision !== currentRevision) {
        throw new AppError(409, "WORKSPACE_REGISTRY_CONFLICT", "Das Workspace-Register wurde auf einem anderen Gerät geändert.");
      }
      revision = currentRevision + 1;
      updatedAt = new Date().toISOString();
      this.db.prepare(`INSERT INTO workspace_registries(owner_id, document_json, revision, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET document_json=excluded.document_json,
        revision=excluded.revision, updated_at=excluded.updated_at`).run(userId, JSON.stringify(parsed), revision, updatedAt);
      this.db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    return { document: parsed, revision, updatedAt };
  }
}
