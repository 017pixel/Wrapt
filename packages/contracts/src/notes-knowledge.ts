import { z } from "zod";
import { noteIdSchema, noteTitleSchema, noteSchema, noteFolderSchema } from "./notes.js";

export const noteKnowledgeSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30),
});
export const noteKnowledgeResponseSchema = z.object({ metadata: noteKnowledgeSchema });
export const noteBacklinksSchema = z.object({ notes: z.array(z.object({ id: noteIdSchema, title: noteTitleSchema, excerpt: z.string() })) });
export const noteHistorySchema = z.object({ entries: z.array(z.object({
  id: z.number().int(), title: z.string(), content: z.string(), revision: z.number().int(), createdAt: z.string(),
})) });
export const noteRestoreRequestSchema = z.object({ entryId: z.number().int().positive(), expectedRevision: z.number().int().positive() });
export const noteTaskSchema = z.object({
  noteId: noteIdSchema, noteTitle: z.string(), line: z.number().int().nonnegative(), text: z.string(), checked: z.boolean(),
  revision: z.number().int(), projectId: z.string().nullable(), due: z.string().nullable(),
});
export const noteTasksSchema = z.object({ tasks: z.array(noteTaskSchema) });
export const noteTaskUpdateSchema = z.object({ expectedRevision: z.number().int().positive(), checked: z.boolean(), due: z.iso.date().nullable().optional() });
export type NoteTask = z.infer<typeof noteTaskSchema>;
export type NoteKnowledge = z.infer<typeof noteKnowledgeSchema>;

export const NOTES_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;
export const notesArchiveSchema = z.object({
  version: z.literal(1),
  notes: z.array(noteSchema).max(1000),
  folders: z.array(noteFolderSchema).max(1000),
  metadata: z.record(z.string(), noteKnowledgeSchema).default({}),
  assets: z.record(z.string(), z.object({ file: z.string(), type: z.string() })).default({}),
});
export const notesImportResponseSchema = z.object({ created: z.number().int().nonnegative() });
export type NotesArchive = z.infer<typeof notesArchiveSchema>;
