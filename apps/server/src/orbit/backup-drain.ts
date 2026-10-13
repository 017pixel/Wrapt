import type { DatabaseSync } from "node:sqlite";
import { settings } from "../config/settings.js";
import { OrbitBackupWorker, type OrbitBackupWriter, type PendingOrbitBackup } from "./backup-worker.js";

export interface OrbitBackupDrainOptions {
  writer?: OrbitBackupWriter;
  batchSize?: number;
  batchMilliseconds?: number;
  shutdownMilliseconds?: number;
}

/** SQL bleibt atomar; nur bestätigte fsync-Sicherungen verlassen die Outbox. */
export class OrbitBackupDrain {
  private readonly writer: OrbitBackupWriter;
  private pending: Promise<boolean> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private immediate: NodeJS.Immediate | null = null;
  private closing = false;
  private readonly options: Required<Omit<OrbitBackupDrainOptions, "writer">>;

  constructor(private readonly database: DatabaseSync, directory: string, options: OrbitBackupDrainOptions = {}) {
    this.writer = options.writer ?? new OrbitBackupWorker(directory);
    this.options = {
      batchSize: options.batchSize ?? settings.orbitBackupDrain.batchSize,
      batchMilliseconds: options.batchMilliseconds ?? settings.orbitBackupDrain.batchMilliseconds,
      shutdownMilliseconds: options.shutdownMilliseconds ?? settings.orbitBackupDrain.shutdownMilliseconds,
    };
  }

  schedule(delay = 0): void {
    if (this.closing || this.timer || this.immediate || this.pending) return;
    const run = () => {
      this.timer = null;
      this.immediate = null;
      void this.batch().then((success) => { if (this.hasPending()) this.schedule(success ? 0 : settings.orbitBackupDrain.retryMilliseconds); });
    };
    if (delay) { this.timer = setTimeout(run, delay); this.timer.unref(); }
    else { this.immediate = setImmediate(run); this.immediate.unref(); }
  }

  private hasPending(): boolean {
    return Boolean(this.database.prepare("SELECT 1 FROM orbit_backup_outbox LIMIT 1").get());
  }

  private batch(): Promise<boolean> {
    if (this.pending) return this.pending;
    const pending = this.drainBatch().finally(() => { if (this.pending === pending) this.pending = null; });
    this.pending = pending;
    return pending;
  }

  private async drainBatch(): Promise<boolean> {
    const started = Date.now();
    try {
      for (let count = 0; count < this.options.batchSize; count += 1) {
        const item = this.database.prepare(`SELECT o.revision,o.updated_at updatedAt,r.document_json documentJson
          FROM orbit_backup_outbox o JOIN orbit_document_revisions r ON r.revision=o.revision ORDER BY o.revision LIMIT 1`).get() as PendingOrbitBackup | undefined;
        if (!item) break;
        try {
          await this.writer.write(item);
          this.database.prepare("DELETE FROM orbit_backup_outbox WHERE revision=?").run(item.revision);
        } catch (error) {
          this.database.prepare("UPDATE orbit_backup_outbox SET attempts=attempts+1,last_error=? WHERE revision=?")
            .run(error instanceof Error ? error.message.slice(0, 500) : "Backupfehler", item.revision);
          throw error;
        }
        if (Date.now() - started >= this.options.batchMilliseconds) break;
      }
      const current = this.database.prepare("SELECT revision FROM orbit_documents WHERE id='default'").get() as { revision: number } | undefined;
      if (current) await this.prune(current.revision);
      this.database.prepare(`INSERT INTO orbit_maintenance_state(id,last_error,failed_at) VALUES(1,NULL,NULL)
        ON CONFLICT(id) DO UPDATE SET last_error=NULL,failed_at=NULL`).run();
      return true;
    } catch (error) {
      this.database.prepare(`INSERT INTO orbit_maintenance_state(id,last_error,failed_at) VALUES(1,?,?)
        ON CONFLICT(id) DO UPDATE SET last_error=excluded.last_error,failed_at=excluded.failed_at`)
        .run(error instanceof Error ? error.message.slice(0, 500) : "Wartungsfehler", new Date().toISOString());
      return false;
    }
  }

  private async prune(revision: number): Promise<void> {
    const minimum = Math.max(1, revision - settings.orbitRevisionRetentionCount + 1);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM orbit_document_revisions WHERE revision < ? AND revision NOT IN (SELECT revision FROM orbit_backup_outbox)").run(minimum);
      this.database.prepare(`DELETE FROM orbit_conflict_backups WHERE id NOT IN (
        SELECT id FROM orbit_conflict_backups ORDER BY id DESC LIMIT ?)`)
        .run(settings.orbitConflictRetentionCount);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
    const pending = this.database.prepare("SELECT revision FROM orbit_backup_outbox").all() as Array<{ revision: number }>;
    await this.writer.prune(minimum, pending.map((item) => item.revision));
  }

  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.immediate) { clearImmediate(this.immediate); this.immediate = null; }
    do { if (!await this.batch()) break; } while (this.hasPending());
  }

  async close(): Promise<void> {
    this.closing = true;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, this.options.shutdownMilliseconds); });
    const flushing = this.flush();
    try { await Promise.race([flushing, timeout]); }
    finally {
      if (timer) clearTimeout(timer);
      await this.writer.close();
      await flushing;
    }
  }
}
