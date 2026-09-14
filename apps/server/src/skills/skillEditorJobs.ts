import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SkillEditorJobOperation = "create" | "rename" | "delete";
export type SkillEditorJobState = "running" | "completed" | "failed" | "needs-recovery";

export interface SkillEditorJob {
  key: string;
  operation: SkillEditorJobOperation;
  state: SkillEditorJobState;
  payload: Record<string, unknown>;
  result: unknown;
  error: string | null;
  progress: number;
  updatedAt: number;
}

interface JobRow {
  key: string;
  operation: string;
  state: string;
  payloadJson: string;
  resultJson: string | null;
  error: string | null;
  progress: number;
  updatedAt: number;
}

function toJob(row: JobRow): SkillEditorJob {
  return {
    key: row.key,
    operation: row.operation as SkillEditorJobOperation,
    state: row.state as SkillEditorJobState,
    payload: JSON.parse(row.payloadJson) as Record<string, unknown>,
    result: row.resultJson === null ? null : JSON.parse(row.resultJson),
    error: row.error,
    progress: row.progress,
    updatedAt: row.updatedAt,
  };
}

/**
 * Journal mehrschrittiger Skill-Operationen. Dateisystem und README lassen sich
 * nicht in eine SQLite-Transaktion einschließen; deshalb merkt sich jeder
 * Vorgang seinen Zustand, damit ein Neustart ihn wiederaufnehmen kann.
 */
export class SkillEditorJobStore {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.db.exec(`CREATE TABLE IF NOT EXISTS skill_editor_jobs (
      key TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      state TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )`);
  }

  close() { this.db.close(); }

  find(key: string): SkillEditorJob | undefined {
    const row = this.db.prepare("SELECT key, operation, state, payload_json payloadJson, result_json resultJson, error, progress, updated_at updatedAt FROM skill_editor_jobs WHERE key = ?").get(key) as JobRow | undefined;
    return row ? toJob(row) : undefined;
  }

  unfinished(): SkillEditorJob[] {
    const rows = this.db.prepare("SELECT key, operation, state, payload_json payloadJson, result_json resultJson, error, progress, updated_at updatedAt FROM skill_editor_jobs WHERE state IN ('running', 'needs-recovery') ORDER BY updated_at").all() as unknown as JobRow[];
    return rows.map(toJob);
  }

  start(key: string, operation: SkillEditorJobOperation, payload: Record<string, unknown>) {
    this.db.prepare(`INSERT INTO skill_editor_jobs(key, operation, state, payload_json, result_json, error, progress, updated_at)
      VALUES (?, ?, 'running', ?, NULL, NULL, 0, ?)
      ON CONFLICT(key) DO UPDATE SET operation=excluded.operation, state='running', payload_json=excluded.payload_json, error=NULL, progress=0, updated_at=excluded.updated_at`)
      .run(key, operation, JSON.stringify(payload), Date.now());
  }

  /** Merkt einen begonnenen externen Schritt; ab hier ist Recovery nötig. */
  markProgress(key: string) {
    this.db.prepare("UPDATE skill_editor_jobs SET progress = progress + 1, updated_at = ? WHERE key = ?").run(Date.now(), key);
  }

  complete(key: string, result: unknown) {
    this.db.prepare("UPDATE skill_editor_jobs SET state='completed', result_json=?, error=NULL, updated_at=? WHERE key=?")
      .run(result === undefined ? null : JSON.stringify(result), Date.now(), key);
  }

  settle(key: string, state: "failed" | "needs-recovery", error: string) {
    this.db.prepare("UPDATE skill_editor_jobs SET state=?, error=?, updated_at=? WHERE key=?")
      .run(state, error.slice(0, 2_000), Date.now(), key);
  }
}
