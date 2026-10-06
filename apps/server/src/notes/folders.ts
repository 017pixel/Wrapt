import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { NoteFolder } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

/** Ordner sind Sammlungen von Wurzelseiten; Unterseiten bleiben im Seitenbaum. */
export class NoteFoldersDatabase {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS note_folders (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order REAL NOT NULL
    )`);
    const columns = db.prepare("PRAGMA table_info(notes)").all() as { name: string }[];
    if (!columns.some((column) => column.name === "folder_id")) {
      db.exec("ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES note_folders(id) ON DELETE SET NULL");
    }
    db.exec(`CREATE INDEX IF NOT EXISTS notes_folder ON notes(folder_id);
      INSERT OR IGNORE INTO notes_schema_migrations(version, applied_at) VALUES (3, datetime('now'))`);
  }

  list(): NoteFolder[] {
    return this.db.prepare("SELECT id, name, sort_order AS sortOrder FROM note_folders ORDER BY sort_order, name, id")
      .all() as unknown as NoteFolder[];
  }

  assertExists(folderId: string | null | undefined): void {
    if (folderId && !this.db.prepare("SELECT id FROM note_folders WHERE id=?").get(folderId)) {
      throw new AppError(400, "NOTE_FOLDER_INVALID", "Dieser Ordner existiert nicht.");
    }
  }

  create(name: string): NoteFolder {
    const id = randomUUID();
    const sortOrder = (this.list().at(-1)?.sortOrder ?? 0) + 1;
    this.db.prepare("INSERT INTO note_folders(id, name, sort_order) VALUES (?, ?, ?)").run(id, name, sortOrder);
    return { id, name, sortOrder };
  }

  update(id: string, input: { name?: string | undefined; sortOrder?: number | undefined }): NoteFolder {
    const current = this.list().find((folder) => folder.id === id);
    if (!current) throw new AppError(404, "NOTE_FOLDER_NOT_FOUND", "Dieser Ordner wurde nicht gefunden.");
    const next = { ...current, name: input.name ?? current.name, sortOrder: input.sortOrder ?? current.sortOrder };
    this.db.prepare("UPDATE note_folders SET name=?, sort_order=? WHERE id=?").run(next.name, next.sortOrder, id);
    return next;
  }

  remove(id: string): void {
    // ON DELETE SET NULL erhält sämtliche Seiten in „Alle Notizen“.
    this.db.prepare("DELETE FROM note_folders WHERE id=?").run(id);
  }
}
