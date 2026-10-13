import type { DatabaseSync } from "node:sqlite";
import { createNoteExcerpt } from "./excerpt.js";

/** Excerpts sind vollständig aus dem unveränderten Markdown wiederherstellbar. */
export function rebuildNoteExcerpts(db: DatabaseSync): void {
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    const rows = db.prepare("SELECT id, content FROM notes").iterate() as Iterable<{ id: string; content: string }>;
    const update = db.prepare("UPDATE notes SET excerpt=? WHERE id=?");
    for (const row of rows) update.run(createNoteExcerpt(row.content), row.id);
    if (ownsTransaction) db.exec("COMMIT");
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

export function migrateNoteExcerpts(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
  db.exec("BEGIN IMMEDIATE");
  try {
    if (!columns.some((column) => column.name === "excerpt")) {
      db.exec("ALTER TABLE notes ADD COLUMN excerpt TEXT NOT NULL DEFAULT ''");
      rebuildNoteExcerpts(db);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS notes_summary_order ON notes(sort_order, updated_at DESC);
      INSERT OR IGNORE INTO notes_schema_migrations(version, applied_at) VALUES (4, datetime('now'))`);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
