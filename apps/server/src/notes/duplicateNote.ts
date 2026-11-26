import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { NOTE_TITLE_MAX_LENGTH, type Note } from "@wrapt/contracts";

/**
 * Kopiert eine Notiz atomar: Inhalt, Icon, Cover, Ordner und Wissensmetadaten.
 * Unterseiten und Verlauf werden bewusst nicht kopiert. Bei einem Fehler bleibt
 * keine halbe Kopie zurück.
 */
export function duplicateNoteRecord(db: DatabaseSync, source: Note, sortOrder: number): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  const title = `${source.title} Kopie`.slice(0, NOTE_TITLE_MAX_LENGTH);
  let committed = false;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(`INSERT INTO notes (id, title, content, icon, cover_asset_id, parent_id, folder_id, sort_order, favorite, archived, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`).run(
      id, title, source.content, source.icon, source.coverAssetId,
      source.parentId, source.parentId === null ? source.folderId ?? null : null,
      sortOrder, source.favorite ? 1 : 0, now, now,
    );
    db.prepare(`INSERT INTO note_knowledge(note_id, project_id, tags)
      SELECT ?, project_id, tags FROM note_knowledge WHERE note_id = ?`).run(id, source.id);
    db.exec("COMMIT");
    committed = true;
  } catch (error) {
    if (!committed && db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return id;
}
