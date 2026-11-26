import { z } from "zod";
import { noteIdSchema, noteTitleSchema, noteSchema, noteFolderSchema } from "./notes.js";

export const noteKnowledgeSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30),
});
export const noteKnowledgeResponseSchema = z.object({ metadata: noteKnowledgeSchema });
export const noteBacklinksSchema = z.object({ notes: z.array(z.object({ id: noteIdSchema, title: noteTitleSchema, excerpt: z.string() })) });

/**
 * Byte-Budget je Notiz für Verlauf und Konfliktsicherungen. Älteste Fassungen
 * werden zuerst entfernt; die 100er-Grenze bleibt zusätzlich bestehen.
 */
export const NOTE_HISTORY_BUDGET_BYTES = 8 * 1024 * 1024;
export const NOTE_HISTORY_MAX_VERSIONS = 100;

/**
 * Die Verlaufsliste enthält nur Metadaten. Der Inhalt einer Fassung wird
 * gezielt über `GET /notes/:noteId/history/:entryId` geladen, damit eine große
 * Notiz nicht bei jedem Öffnen des Panels komplett übertragen wird.
 */
export const noteHistoryEntrySchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  revision: z.number().int(),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export const noteHistorySchema = z.object({ entries: z.array(noteHistoryEntrySchema) });
export const noteHistoryEntryContentSchema = z.object({ entry: noteHistoryEntrySchema.extend({ content: z.string() }) });
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
