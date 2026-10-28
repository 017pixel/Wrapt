import { notesArchiveSchema, notesImportResponseSchema, type NotesArchive, noteBacklinksSchema, noteHistorySchema, noteKnowledgeResponseSchema, noteTasksSchema, saveNoteContentResponseSchema, type NoteKnowledge } from "@wrapt/contracts";
import { mutate, request } from "./transport";
const path = (id: string) => `/notes/${encodeURIComponent(id)}`;
export const notesKnowledgeApi = {
  notesArchive: () => request("/notes/export", notesArchiveSchema),
  importNotesArchive: (archive: NotesArchive) => mutate("/notes/import", "POST", notesImportResponseSchema, archive),
  noteMetadata: (id: string) => request(`${path(id)}/metadata`, noteKnowledgeResponseSchema),
  setNoteMetadata: (id: string, metadata: NoteKnowledge) => mutate(`${path(id)}/metadata`, "PUT", noteKnowledgeResponseSchema, metadata),
  noteBacklinks: (id: string) => request(`${path(id)}/backlinks`, noteBacklinksSchema),
  noteHistory: (id: string) => request(`${path(id)}/history`, noteHistorySchema),
  restoreNoteVersion: (id: string, entryId: number, expectedRevision: number) => mutate(`${path(id)}/history/restore`, "POST", saveNoteContentResponseSchema, { entryId, expectedRevision }),
  noteTasks: () => request("/notes/tasks", noteTasksSchema),
  setNoteTask: (id: string, line: number, expectedRevision: number, checked: boolean, due?: string | null) => mutate(`${path(id)}/tasks/${line}`, "PATCH", saveNoteContentResponseSchema, { expectedRevision, checked, ...(due === undefined ? {} : { due }) }),
};
