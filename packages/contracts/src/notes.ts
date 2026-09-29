import { z } from "zod";

/**
 * Verträge für das Notizen-Feature. Notizen werden als Markdown gespeichert;
 * Titel und Metadaten liegen daneben. Die Revision schützt vor stillen
 * Überschreibungen bei parallelen Bearbeitungen (zwei Tabs, Orbit und Seite).
 */

export const NOTE_TITLE_MAX_LENGTH = 300;
export const NOTE_CONTENT_MAX_CHARACTERS = 2_000_000;
export const NOTE_ICON_MAX_LENGTH = 16;
export const NOTE_SORT_ORDER_MIN = -1_000_000;
export const NOTE_SORT_ORDER_MAX = 1_000_000;
export const NOTE_EXCERPT_MAX_LENGTH = 200;

export const noteIdSchema = z.string().uuid();

export const noteIconSchema = z
  .string()
  .trim()
  .min(1)
  .max(NOTE_ICON_MAX_LENGTH)
  .nullable()
  .default(null);

/** Für Updates ohne Standardwert: `undefined` bedeutet „nicht ändern“. */
const noteIconValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(NOTE_ICON_MAX_LENGTH)
  .nullable();

export const noteTitleSchema = z.string().trim().min(1).max(NOTE_TITLE_MAX_LENGTH);

export const noteSortOrderSchema = z
  .number()
  .finite()
  .min(NOTE_SORT_ORDER_MIN)
  .max(NOTE_SORT_ORDER_MAX);

export const noteSchema = z.object({
  id: noteIdSchema,
  title: noteTitleSchema,
  content: z.string().max(NOTE_CONTENT_MAX_CHARACTERS),
  icon: noteIconSchema,
  coverAssetId: z.string().uuid().nullable().default(null),
  parentId: noteIdSchema.nullable().default(null),
  sortOrder: noteSortOrderSchema.default(0),
  favorite: z.boolean().default(false),
  archived: z.boolean().default(false),
  revision: z.number().int().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const noteSummarySchema = z.object({
  id: noteIdSchema,
  title: noteTitleSchema,
  icon: noteIconSchema,
  parentId: noteIdSchema.nullable().default(null),
  sortOrder: noteSortOrderSchema.default(0),
  favorite: z.boolean().default(false),
  archived: z.boolean().default(false),
  excerpt: z.string().max(NOTE_EXCERPT_MAX_LENGTH),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});

export const notesListResponseSchema = z.object({
  notes: z.array(noteSummarySchema),
});

export const noteResponseSchema = z.object({
  note: noteSchema,
});

export const createNoteRequestSchema = z.object({
  title: noteTitleSchema.default("Unbenannte Notiz"),
  parentId: noteIdSchema.nullable().default(null),
});

export const updateNoteRequestSchema = z
  .object({
    title: noteTitleSchema.optional(),
    icon: noteIconValueSchema.optional(),
    coverAssetId: z.string().uuid().nullable().optional(),
    parentId: noteIdSchema.nullable().optional(),
    sortOrder: noteSortOrderSchema.optional(),
    favorite: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .superRefine((input, context) => {
    if (Object.values(input).every((value) => value === undefined)) {
      context.addIssue({
        code: "custom",
        message: "Mindestens ein Feld muss geändert werden.",
      });
    }
  });

export const saveNoteContentRequestSchema = z.object({
  content: z.string().max(NOTE_CONTENT_MAX_CHARACTERS),
  expectedRevision: z.number().int().min(1),
});

/**
 * Antwort des Inhaltsspeicherns. `conflict` bedeutet: Eine andere Sitzung war
 * schneller und hat die Notiz weiterentwickelt; die übergebene Fassung liegt
 * serverseitig als Konfliktsicherung und die aktuelle Notiz wird mitgeliefert.
 */
export const saveNoteContentResponseSchema = z.object({
  status: z.enum(["saved", "conflict"]),
  note: noteSchema,
});

export const noteSearchRangeSchema = z.enum(["any", "today", "week", "month"]);

/**
 * Suchanfrage der Notizen. `titleOnly` durchsucht nur Titel, `scopeId`
 * begrenzt auf eine Seite samt Unterseiten, die Zeiträume filtern nach
 * Erstell- beziehungsweise Änderungsdatum.
 */
export const noteSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  titleOnly: z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((value) => value === "1" || value === "true"),
  scopeId: noteIdSchema.optional(),
  createdWithin: noteSearchRangeSchema.default("any"),
  updatedWithin: noteSearchRangeSchema.default("any"),
});

export type Note = z.infer<typeof noteSchema>;
export type NoteSummary = z.infer<typeof noteSummarySchema>;
export type NotesListResponse = z.infer<typeof notesListResponseSchema>;
export type NoteResponse = z.infer<typeof noteResponseSchema>;
export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;
export type UpdateNoteRequest = z.infer<typeof updateNoteRequestSchema>;
export type SaveNoteContentRequest = z.infer<typeof saveNoteContentRequestSchema>;
export type SaveNoteContentResponse = z.infer<typeof saveNoteContentResponseSchema>;
export type NoteSearchRange = z.infer<typeof noteSearchRangeSchema>;
export type NoteSearchQuery = z.infer<typeof noteSearchQuerySchema>;
