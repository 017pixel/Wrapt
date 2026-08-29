import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type ExtensionManagementOperation,
  type ExtensionPermissionReview,
  type ExtensionRegistryDetail,
} from "@wrapt/extension-contracts";
import { detailFromRow, operationFromRow, reviewFromRow, defaultHealth as codecDefaultHealth } from "./database-codecs.js";

interface ExtensionRow {
  id: string;
  name: string;
  description: string;
  publisher: string;
  source_json: string;
  effective_trust: string;
  lifecycle: string;
  desired_enablement: string;
  runtime_active: number;
  required: number;
  installed_version: string | null;
  active_version: string | null;
  available_version: string | null;
  rollback_version: string | null;
  rollback_asset_revision: string | null;
  active_asset_revision: string | null;
  manifest_json: string | null;
  granted_permissions_json: string;
  health_json: string;
  created_at: string;
  updated_at: string;
}

interface OperationRow {
  id: string;
  extension_id: string;
  type: string;
  status: string;
  requested_at: string;
  started_at: string | null;
  completed_at: string | null;
  target_version: string | null;
  error_json: string | null;
}

interface ReviewRow {
  review_id: string;
  extension_id: string;
  reason: string;
  requested_json: string;
  added_json: string;
  created_at: string;
}

interface RegistryStateRow {
  revision: number;
}

/**
 * Serverseitige Extension Registry. Sie hält installierte Versionen,
 * Enablement, Runtime-Fakten, Health, Permission Reviews und das
 * Operationsjournal getrennt; jede Mutation erhöht die Registry-Revision,
 * damit veraltete Aufrufer abgelehnt werden.
 */
export class ExtensionDatabase {
  private readonly database: DatabaseSync;
  private recoveredTransientOperations = 0;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.migrate();
    this.recoveredTransientOperations = this.reconcileTransientOperations();
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS extension_registry_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL DEFAULT 0
      );
      INSERT OR IGNORE INTO extension_registry_state (id, revision) VALUES (1, 0);

      CREATE TABLE IF NOT EXISTS extensions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        publisher TEXT NOT NULL,
        source_json TEXT NOT NULL,
        effective_trust TEXT NOT NULL,
        lifecycle TEXT NOT NULL,
        desired_enablement TEXT NOT NULL,
        runtime_active INTEGER NOT NULL DEFAULT 0,
        required INTEGER NOT NULL DEFAULT 0,
        installed_version TEXT,
        active_version TEXT,
        available_version TEXT,
        rollback_version TEXT,
        rollback_asset_revision TEXT,
        active_asset_revision TEXT,
        manifest_json TEXT,
        granted_permissions_json TEXT NOT NULL DEFAULT '[]',
        health_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS extension_operations (
        id TEXT PRIMARY KEY,
        extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        target_version TEXT,
        error_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_extension_operations_extension
        ON extension_operations (extension_id, requested_at DESC);

      CREATE TABLE IF NOT EXISTS extension_permission_reviews (
        review_id TEXT PRIMARY KEY,
        extension_id TEXT NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        requested_json TEXT NOT NULL,
        added_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS extension_quarantine (
        extension_id TEXT PRIMARY KEY,
        reason TEXT NOT NULL,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        observations INTEGER NOT NULL DEFAULT 1
      ) STRICT;
    `);
    const columns = this.database.prepare("PRAGMA table_info(extensions)").all() as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "rollback_asset_revision")) {
      this.database.exec("ALTER TABLE extensions ADD COLUMN rollback_asset_revision TEXT");
    }
  }

  close(): void {
    this.database.close();
  }

  serialize(): Uint8Array {
    return this.database.serialize();
  }

  transaction<T>(callback: () => T): T {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  recoveredTransientOperationCount(): number {
    return this.recoveredTransientOperations;
  }

  private reconcileTransientOperations(): number {
    const transient = this.database.prepare(
      "SELECT id FROM extension_operations WHERE status IN ('queued', 'running')",
    ).all() as Array<{ id: string }>;
    if (transient.length === 0) return 0;
    const occurredAt = new Date().toISOString();
    const error = JSON.stringify({ code: "internal-error", occurredAt });
    this.transaction(() => {
      for (const operation of transient) {
        this.database.prepare(
          "UPDATE extension_operations SET status = 'failed', completed_at = ?, error_json = ? WHERE id = ?",
        ).run(occurredAt, error, operation.id);
      }
      this.database.prepare("UPDATE extension_registry_state SET revision = revision + 1 WHERE id = 1").run();
    });
    return transient.length;
  }

  revision(): number {
    const row = this.database
      .prepare("SELECT revision FROM extension_registry_state WHERE id = 1")
      .get() as RegistryStateRow | undefined;
    return row?.revision ?? 0;
  }

  bumpRevision(): number {
    this.database
      .prepare("UPDATE extension_registry_state SET revision = revision + 1 WHERE id = 1")
      .run();
    return this.revision();
  }

  getExtension(id: string): ExtensionRegistryDetail | null {
    const row = this.database
      .prepare("SELECT * FROM extensions WHERE id = ?")
      .get(id) as ExtensionRow | undefined;
    return row ? this.decodeExtension(row) : null;
  }

  listExtensions(): ExtensionRegistryDetail[] {
    const rows = this.database
      .prepare("SELECT * FROM extensions ORDER BY id")
      .all() as unknown as ExtensionRow[];
    return rows
      .map((row) => this.decodeExtension(row))
      .filter((detail): detail is ExtensionRegistryDetail => detail !== null);
  }

  quarantinedExtensionCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) count FROM extension_quarantine").get() as { count: number };
    return Number(row.count);
  }

  upsertExtension(detail: ExtensionRegistryDetail): void {
    this.database
      .prepare(
        `INSERT INTO extensions (
          id, name, description, publisher, source_json, effective_trust,
          lifecycle, desired_enablement, runtime_active, required,
          installed_version, active_version, available_version,
          rollback_version, rollback_asset_revision, active_asset_revision, manifest_json,
          granted_permissions_json, health_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          publisher = excluded.publisher,
          source_json = excluded.source_json,
          effective_trust = excluded.effective_trust,
          lifecycle = excluded.lifecycle,
          desired_enablement = excluded.desired_enablement,
          runtime_active = excluded.runtime_active,
          required = excluded.required,
          installed_version = excluded.installed_version,
          active_version = excluded.active_version,
          available_version = excluded.available_version,
          rollback_version = excluded.rollback_version,
          rollback_asset_revision = excluded.rollback_asset_revision,
          active_asset_revision = excluded.active_asset_revision,
          manifest_json = excluded.manifest_json,
          granted_permissions_json = excluded.granted_permissions_json,
          health_json = excluded.health_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        detail.id,
        detail.name,
        detail.description,
        detail.publisher,
        JSON.stringify(detail.source),
        detail.effectiveTrust,
        detail.lifecycle,
        detail.desiredEnablement,
        detail.runtimeActive ? 1 : 0,
        detail.required ? 1 : 0,
        detail.installedVersion ?? null,
        detail.activeVersion ?? null,
        detail.availableVersion ?? null,
        detail.rollbackVersion ?? null,
        detail.rollbackAssetRevision ?? null,
        detail.activeAssetRevision ?? null,
        JSON.stringify(detail.manifest),
        JSON.stringify(detail.grantedPermissions),
        JSON.stringify(detail.health),
        new Date().toISOString(),
        new Date().toISOString(),
      );
    this.database.prepare("DELETE FROM extension_quarantine WHERE extension_id = ?").run(detail.id);
  }

  removeExtension(id: string): void {
    this.database.prepare("DELETE FROM extensions WHERE id = ?").run(id);
    this.database.prepare("DELETE FROM extension_quarantine WHERE extension_id = ?").run(id);
  }

  private decodeExtension(row: ExtensionRow): ExtensionRegistryDetail | null {
    const detail = detailFromRow(row, this.openReview(row.id) ?? undefined);
    if (detail !== null) return detail;
    const now = new Date().toISOString();
    this.database.prepare(`
      INSERT INTO extension_quarantine(extension_id, reason, first_seen_at, last_seen_at, observations)
      VALUES(?, 'schema-validation-failed', ?, ?, 1)
      ON CONFLICT(extension_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, observations = observations + 1
    `).run(row.id, now, now);
    return null;
  }

  listOperations(extensionId: string): ExtensionManagementOperation[] {
    const rows = this.database
      .prepare(
        "SELECT * FROM extension_operations WHERE extension_id = ? ORDER BY requested_at DESC, rowid DESC LIMIT 64",
      )
      .all(extensionId) as unknown as OperationRow[];
    return rows
      .map((row) => operationFromRow(row))
      .filter((operation): operation is ExtensionManagementOperation => operation !== null);
  }

  addOperation(extensionId: string, operation: ExtensionManagementOperation): void {
    this.database
      .prepare(
        `INSERT INTO extension_operations (
          id, extension_id, type, status, requested_at, started_at,
          completed_at, target_version, error_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        operation.id,
        extensionId,
        operation.type,
        operation.status,
        operation.requestedAt,
        operation.startedAt ?? null,
        operation.completedAt ?? null,
        operation.targetVersion ?? null,
        operation.error ? JSON.stringify(operation.error) : null,
      );
  }

  updateOperation(operation: ExtensionManagementOperation): void {
    this.database
      .prepare(
        `UPDATE extension_operations SET status = ?, started_at = ?, completed_at = ?, error_json = ?
         WHERE id = ?`,
      )
      .run(
        operation.status,
        operation.startedAt ?? null,
        operation.completedAt ?? null,
        operation.error ? JSON.stringify(operation.error) : null,
        operation.id,
      );
  }

  lastOperation(extensionId: string): ExtensionManagementOperation | undefined {
    const operations = this.listOperations(extensionId);
    return operations[0];
  }

  addReview(extensionId: string, review: ExtensionPermissionReview): void {
    this.database
      .prepare(
        `INSERT INTO extension_permission_reviews (
          review_id, extension_id, reason, requested_json, added_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        review.reviewId,
        extensionId,
        review.reason,
        JSON.stringify(review.requestedPermissions),
        JSON.stringify(review.addedPermissions),
        review.createdAt,
      );
  }

  getReview(extensionId: string, reviewId: string): ExtensionPermissionReview | null {
    const row = this.database
      .prepare("SELECT * FROM extension_permission_reviews WHERE review_id = ? AND extension_id = ? AND resolved = 0")
      .get(reviewId, extensionId) as ReviewRow | undefined;
    return row === undefined ? null : reviewFromRow(row) as ExtensionPermissionReview | null;
  }

  openReview(extensionId: string): ExtensionPermissionReview | null {
    const row = this.database
      .prepare(
        "SELECT * FROM extension_permission_reviews WHERE extension_id = ? AND resolved = 0 ORDER BY created_at DESC LIMIT 1",
      )
      .get(extensionId) as ReviewRow | undefined;
    return row === undefined ? null : reviewFromRow(row) as ExtensionPermissionReview | null;
  }

  resolveReview(reviewId: string): void {
    this.database
      .prepare("UPDATE extension_permission_reviews SET resolved = 1 WHERE review_id = ?")
      .run(reviewId);
  }

}

export { codecDefaultHealth as defaultHealth };
