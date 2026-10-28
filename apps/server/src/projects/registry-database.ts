import { mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface RegisteredProject {
  id: string;
  path: string;
  name: string;
  createdAt: string;
}

interface RegistryRow {
  id: string;
  path: string;
  name: string;
  createdAt: string;
}

function projectSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "ordner";
}

export function registeredProjectId(path: string): string {
  const hash = createHash("sha256").update(path).digest("hex").slice(0, 10);
  return `custom-${projectSlug(basename(path))}-${hash}`;
}

export class ProjectRegistryDatabase {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    // NORMAL statt FULL: Mit WAL ist NORMAL absturzsicher (fsync am Checkpoint statt pro Commit, P-010).
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS project_registry (
        id TEXT PRIMARY KEY,
        canonical_path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
    `);
    // Nur der Projektbestand wird übernommen; die historische Tabelle bleibt unverändert.
    if (this.database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='orbit_project_registry'").get()) {
      this.database.exec(`INSERT OR IGNORE INTO project_registry(id, canonical_path, name, created_at)
        SELECT id, canonical_path, name, created_at FROM orbit_project_registry`);
    }
  }

  list(): RegisteredProject[] {
    return (this.database.prepare(`
      SELECT id, canonical_path AS path, name, created_at AS createdAt
      FROM project_registry
      ORDER BY created_at ASC, canonical_path ASC
    `).all() as unknown as RegistryRow[]).map((row) => ({ ...row }));
  }

  findByPath(path: string): RegisteredProject | null {
    const row = this.database.prepare(`
      SELECT id, canonical_path AS path, name, created_at AS createdAt
      FROM project_registry
      WHERE canonical_path = ?
    `).get(path) as RegistryRow | undefined;
    return row ? { ...row } : null;
  }

  register(path: string, name = basename(path), at = new Date().toISOString(), preferredId?: string): { project: RegisteredProject; created: boolean } {
    // D-010: idempotent per Upsert statt Check-then-Insert — zwei parallele
    // POST /projects/register mit gleichem Pfad liefern beide 200/201 statt 500.
    const id = preferredId ?? registeredProjectId(path);
    const inserted = this.database.prepare(`
      INSERT INTO project_registry (id, canonical_path, name, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(canonical_path) DO NOTHING
    `).run(id, path, name, at);
    const stored = this.findByPath(path);
    if (!stored) throw new Error("Projektregistrierung fehlgeschlagen.");
    return { project: stored, created: inserted.changes === 1 };
  }

  close() { this.database.close(); }
}
