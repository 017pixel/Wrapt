import type { DatabaseSync } from "node:sqlite";
import type { NotesArchive } from "@wrapt/contracts";
import type { NotesDatabase } from "./database.js";
import { AppError } from "../utils/errors.js";

/** Neue IDs verhindern Überschreiben. Der gesamte Seitenimport ist atomar. */
export function importNotesArchive(db: DatabaseSync, notes: NotesDatabase, archive: NotesArchive) {
  if (new Set(archive.notes.map((note) => note.id)).size !== archive.notes.length || new Set(archive.folders.map((folder) => folder.id)).size !== archive.folders.length) {
    throw new AppError(400, "NOTE_ARCHIVE_DUPLICATE", "Das Archiv enthält doppelte IDs.");
  }
  const noteIds = new Set(archive.notes.map((note) => note.id));
  const folderIds = new Set(archive.folders.map((folder) => folder.id));
  if (archive.notes.some((note) => (note.parentId !== null && !noteIds.has(note.parentId)) || (note.folderId && !folderIds.has(note.folderId)))) {
    throw new AppError(400, "NOTE_ARCHIVE_INCOMPLETE", "Das Archiv verweist auf fehlende Elternseiten oder Sammlungen. Es wurden keine Seiten importiert.");
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const folders = new Map(archive.folders.map((folder) => [folder.id, notes.folders.create(folder.name).id]));
    const created = new Map(archive.notes.map((original) => [original.id, notes.create({ title: original.title, parentId: null })]));
    for (const original of archive.notes) {
      const note = created.get(original.id)!;
      const content = original.content.replace(/\[noteMention\s+[^\]]*\]/g, (reference) => reference.replace(/noteId="([a-f\d-]{36})"/gi, (all, id: string) => created.has(id) ? `noteId="${created.get(id)!.id}"` : all));
      const saved = notes.saveContent(note.id, content, note.revision);
      if (saved.status !== "saved") throw new AppError(409, "NOTE_ARCHIVE_CONFLICT", "Der Import konnte nicht vollständig gespeichert werden.");
      notes.update(note.id, {
        parentId: original.parentId ? created.get(original.parentId)?.id ?? null : null,
        folderId: original.folderId ? folders.get(original.folderId) ?? null : null,
        sortOrder: original.sortOrder, favorite: original.favorite, archived: original.archived,
        icon: original.icon, coverAssetId: original.coverAssetId,
      });
      const metadata = archive.metadata[original.id];
      if (metadata) notes.knowledge.setMetadata(note.id, metadata);
    }
    db.exec("COMMIT");
    return { created: created.size };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}
