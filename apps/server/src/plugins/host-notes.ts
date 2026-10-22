import { createNoteRequestSchema, updateNoteRequestSchema, moveNoteRequestSchema, saveNoteContentRequestSchema, noteSearchQuerySchema, noteFolderRequestSchema, noteFolderUpdateSchema, notesListResponseSchema, noteResponseSchema, saveNoteContentResponseSchema, noteFolderResponseSchema } from "@wrapt/contracts";
import { z } from "zod";
import type { NotesDatabase } from "../notes/database.js";
import { AppError } from "../utils/errors.js";
import type { PluginHostApi } from "./code-host-api.js";

export function registerNotesPluginApi(api: PluginHostApi, notes: NotesDatabase): void {
  const id = z.object({ noteId: z.uuid() });
  const folderId = z.object({ folderId: z.uuid() });
  api.register("notes.list", { description: "Notizen und Ordner lesen", mutates: false, hookable: true, output: notesListResponseSchema, handler: () => ({ notes: notes.list(), folders: notes.folders.list() }) });
  api.register("notes.search", { description: "Notizen durchsuchen", mutates: false, hookable: true, input: noteSearchQuerySchema, output: notesListResponseSchema, handler: (query) => ({ notes: notes.search(query) }) });
  api.register("notes.get", { description: "Notiz lesen", mutates: false, hookable: true, input: id, output: noteResponseSchema, handler: ({ noteId }) => {
    const note = notes.get(noteId);
    if (!note) throw new AppError(404, "NOTE_NOT_FOUND", "Diese Notiz wurde nicht gefunden.");
    return { note };
  } });
  api.register("notes.create", { description: "Notiz erstellen", mutates: true, hookable: true, input: createNoteRequestSchema, output: noteResponseSchema, handler: (input) => ({ note: notes.create(input) }) });
  api.register("notes.update", { description: "Notiz ändern", mutates: true, hookable: true, input: id.extend({ changes: updateNoteRequestSchema }), output: noteResponseSchema, handler: ({ noteId, changes }) => ({ note: notes.update(noteId, changes) }) });
  api.register("notes.move", { description: "Notiz verschieben", mutates: true, hookable: true, input: id.extend({ changes: moveNoteRequestSchema }), output: noteResponseSchema, handler: ({ noteId, changes }) => ({ note: notes.move(noteId, changes) }) });
  api.register("notes.saveContent", { description: "Inhalt mit Revisionsprüfung speichern", mutates: true, hookable: true, input: id.extend({ changes: saveNoteContentRequestSchema }), output: saveNoteContentResponseSchema, handler: ({ noteId, changes }) => notes.saveContent(noteId, changes.content, changes.expectedRevision) });
  api.register("notes.archive", { description: "Notiz archivieren", mutates: true, hookable: true, input: id, output: z.null(), handler: ({ noteId }) => { notes.archive(noteId); return null; } });
  api.register("notes.restore", { description: "Notiz wiederherstellen", mutates: true, hookable: true, input: id, output: noteResponseSchema, handler: ({ noteId }) => ({ note: notes.restore(noteId) }) });
  api.register("noteFolders.create", { description: "Notizordner erstellen", mutates: true, hookable: true, input: noteFolderRequestSchema, output: noteFolderResponseSchema, handler: ({ name }) => ({ folder: notes.folders.create(name) }) });
  api.register("noteFolders.update", { description: "Notizordner ändern", mutates: true, hookable: true, input: folderId.extend({ changes: noteFolderUpdateSchema }), output: noteFolderResponseSchema, handler: ({ folderId, changes }) => ({ folder: notes.folders.update(folderId, changes) }) });
  api.register("noteFolders.remove", { description: "Notizordner entfernen", mutates: true, hookable: true, input: folderId, output: z.null(), handler: ({ folderId }) => { notes.folders.remove(folderId); return null; } });
}
