import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import type { PluginCollection, PluginContext, PluginRecord, PluginSchema } from "@wrapt/plugin-sdk";
import { AppError } from "../utils/errors.js";

interface RecordRow { id: string; revision: number; value: string; created_at: string; updated_at: string }
interface TransactionScope { active: boolean }

const identifier = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
function fieldName(value: string): string {
  if (!identifier.test(value)) throw new AppError(400, "VALIDATION_ERROR", "Ein einfacher Feld- oder Collection-Name wird erwartet.");
  return value;
}

function json(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new AppError(400, "VALIDATION_ERROR", "Der Wert muss als JSON speicherbar sein.");
  return encoded;
}

function decode<T>(row: RecordRow): PluginRecord<T> {
  return { id: row.id, revision: row.revision, value: JSON.parse(row.value) as T, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Pro Plugin eine eigene SQLite-Datenbank; asynchrone Transaktionen sind serialisiert. */
export class PluginDataStore {
  private readonly database: DatabaseSync;
  private readonly scope = new AsyncLocalStorage<TransactionScope>();
  private queue: Promise<unknown> = Promise.resolve();
  private frozen = false;
  readonly api: PluginContext["storage"];

  constructor(readonly path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS plugin_values (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plugin_records (
        collection TEXT NOT NULL, id TEXT NOT NULL, revision INTEGER NOT NULL,
        value TEXT NOT NULL CHECK(json_valid(value)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(collection, id)
      );
      CREATE TABLE IF NOT EXISTS plugin_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    `);
    this.api = {
      get: <T>(key: string) => this.access(() => {
        const row = this.database.prepare("SELECT value FROM plugin_values WHERE key = ?").get(key) as { value: string } | undefined;
        return row ? JSON.parse(row.value) as T : null;
      }),
      set: (key, value) => this.access(() => { this.assertWritable(); this.database.prepare("INSERT INTO plugin_values(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, json(value)); }),
      remove: (key) => this.access(() => { this.assertWritable(); return Number(this.database.prepare("DELETE FROM plugin_values WHERE key = ?").run(key).changes) > 0; }),
      collection: <T extends Record<string, unknown>>(name: string, options?: { schema?: PluginSchema<T>; indexes?: string[] }) => this.collection(name, options),
      migrate: (version, migration) => this.migrate(version, migration),
      transaction: <T>(operation: () => Promise<T>) => this.transaction(operation),
    };
  }

  async snapshot(target: string): Promise<void> {
    await this.access(async () => {
      // Node 26 kann mit offenem WAL ein vollständig geschriebenes Backup
      // dennoch nie auflösen. Vor dem Backup alle Seiten kontrolliert sichern.
      const checkpoint = this.database.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get() as { busy: number };
      if (checkpoint.busy) throw new AppError(409, "operation-conflict", "Die Plugin-Datenbank ist noch beschäftigt. Snapshot erneut versuchen.");
      await backup(this.database, target);
    });
  }

  async close(): Promise<void> { await this.queue; this.database.close(); }

  async freeze(): Promise<void> { await this.queue; this.frozen = true; }
  thaw(): void { this.frozen = false; }

  private assertWritable(): void {
    if (this.frozen) throw new AppError(409, "operation-conflict", "Der Plugin-Snapshot ist eingefroren. Daten vor dem Wechsel in lifecycle.beforeSnapshot speichern.");
  }

  private access<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.scope.getStore()?.active) return Promise.resolve().then(operation);
    const run = this.queue.then(operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private transaction<T>(operation: () => Promise<T>): Promise<T> {
    if (this.scope.getStore()?.active) return operation();
    return this.access(async () => {
      this.assertWritable();
      this.database.exec("BEGIN IMMEDIATE");
      const scope = { active: true };
      try {
        const result = await this.scope.run(scope, operation);
        this.database.exec("COMMIT");
        return result;
      } catch (error) { this.database.exec("ROLLBACK"); throw error; }
      finally { scope.active = false; }
    });
  }

  private async migrate(version: number, migration: (storage: PluginContext["storage"]) => Promise<void>): Promise<void> {
    if (!Number.isSafeInteger(version) || version < 1) throw new AppError(400, "VALIDATION_ERROR", "Migrationsversionen sind positive ganze Zahlen.");
    await this.transaction(async () => {
      const applied = this.database.prepare("SELECT 1 FROM plugin_migrations WHERE version = ?").get(version);
      if (applied) return;
      const latest = this.database.prepare("SELECT MAX(version) AS version FROM plugin_migrations").get() as { version: number | null };
      if ((latest.version ?? 0) > version) throw new AppError(409, "migration-failed", "Eine ältere Migration darf keinen neueren Datenstand verändern.");
      await migration(this.api);
      this.database.prepare("INSERT INTO plugin_migrations(version, applied_at) VALUES (?, ?)").run(version, new Date().toISOString());
    });
  }

  private collection<T extends Record<string, unknown>>(name: string, options?: { schema?: PluginSchema<T>; indexes?: string[] }): PluginCollection<T> {
    fieldName(name);
    let initialized = false;
    const initialize = (): void => {
      if (initialized) return;
      for (const field of options?.indexes ?? []) {
        this.assertWritable();
        fieldName(field);
        const index = createHash("sha256").update(field).digest("hex").slice(0, 16);
        this.database.exec(`CREATE INDEX IF NOT EXISTS plugin_field_${index} ON plugin_records(collection, json_extract(value, '$.${field}'))`);
      }
      initialized = true;
    };
    const get = (id: string): RecordRow | undefined => this.database.prepare("SELECT id, revision, value, created_at, updated_at FROM plugin_records WHERE collection = ? AND id = ?").get(name, id) as unknown as RecordRow | undefined;
    const collection: PluginCollection<T> = {
      create: (value) => collection.put(randomUUID(), value, { expectedRevision: 0 }),
      list: (query = {}) => this.access(() => {
        initialize();
        const limit = query.limit ?? 100;
        const offset = query.offset ?? 0;
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000 || !Number.isSafeInteger(offset) || offset < 0) throw new AppError(400, "VALIDATION_ERROR", "Ungültige Seitengröße oder Position.");
        const filters = Object.entries(query.filter ?? {});
        const clauses = filters.map(([key]) => `json_extract(value, '$.${fieldName(key)}') IS json_extract(?, '$')`);
        const order = query.orderBy ? `json_extract(value, '$.${fieldName(query.orderBy)}')` : "created_at";
        const sql = `SELECT id, revision, value, created_at, updated_at FROM plugin_records WHERE collection = ?${clauses.map((part) => ` AND ${part}`).join("")} ORDER BY ${order} ${query.descending ? "DESC" : "ASC"}, id ASC LIMIT ? OFFSET ?`;
        const rows = this.database.prepare(sql).all(name, ...filters.map(([, value]) => json(value)), limit, offset) as unknown as RecordRow[];
        return rows.map((row) => decode<T>(row));
      }),
      get: (id) => this.access(() => { const row = get(id); return row ? decode<T>(row) : null; }),
      put: (id, value, writeOptions) => this.access(() => {
        this.assertWritable();
        initialize();
        if (!id || id.length > 256) throw new AppError(400, "VALIDATION_ERROR", "Eine Datensatz-ID mit höchstens 256 Zeichen wird erwartet.");
        const parsed = options?.schema ? options.schema.parse(value) : value;
        const previous = get(id);
        if (writeOptions?.expectedRevision !== undefined && writeOptions.expectedRevision !== (previous?.revision ?? 0)) throw new AppError(409, "operation-conflict", "Der Datensatz wurde inzwischen verändert.");
        const now = new Date().toISOString();
        this.database.prepare(`INSERT INTO plugin_records(collection, id, revision, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(collection, id) DO UPDATE SET revision = excluded.revision, value = excluded.value, updated_at = excluded.updated_at`)
          .run(name, id, (previous?.revision ?? 0) + 1, json(parsed), previous?.created_at ?? now, now);
        return decode<T>(get(id)!);
      }),
      remove: (id, writeOptions) => this.access(() => {
        this.assertWritable();
        const previous = get(id);
        if (writeOptions?.expectedRevision !== undefined && writeOptions.expectedRevision !== (previous?.revision ?? 0)) throw new AppError(409, "operation-conflict", "Der Datensatz wurde inzwischen verändert.");
        return Number(this.database.prepare("DELETE FROM plugin_records WHERE collection = ? AND id = ?").run(name, id).changes) > 0;
      }),
    };
    return collection;
  }
}
