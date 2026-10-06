import {
  createNoteRequestSchema,
  noteFolderResponseSchema,
  noteResponseSchema,
  notesListResponseSchema,
  saveNoteContentResponseSchema,
  type CreateNoteRequest,
  type NoteResponse,
  type NoteSearchQuery,
  type SaveNoteContentRequest,
  type UpdateNoteRequest,
  type MoveNoteRequest,
} from "@wrapt/contracts";
import { mutate, request } from "./transport.js";

function searchParams(input: NoteSearchQuery): string {
  const params = new URLSearchParams({ q: input.q });
  if (input.titleOnly) params.set("titleOnly", "1");
  if (input.scopeId !== undefined) params.set("scopeId", input.scopeId);
  if (input.createdWithin !== "any") params.set("createdWithin", input.createdWithin);
  if (input.updatedWithin !== "any") params.set("updatedWithin", input.updatedWithin);
  return params.toString();
}

export interface CreateGlobalQuicknoteInput {
  title?: string;
}

/** Erstellt ausschließlich eine globale Notes-Seite und liefert `note.id` zurück. */
export async function createGlobalQuicknote(
  input: CreateGlobalQuicknoteInput = {},
): Promise<NoteResponse> {
  const response = await mutate(
    "/notes",
    "POST",
    noteResponseSchema,
    createNoteRequestSchema.parse({ title: input.title ?? "Schnellnotiz", parentId: null }),
  );
  if (!response) throw new Error("Die Schnellnotiz konnte nicht erstellt werden.");
  return response;
}

export const notesApi = {
  createNoteFolder: (name: string) => mutate("/notes/folders", "POST", noteFolderResponseSchema, { name }),
  updateNoteFolder: (id: string, body: { name?: string; sortOrder?: number }) =>
    mutate(`/notes/folders/${encodeURIComponent(id)}`, "PATCH", noteFolderResponseSchema, body),
  deleteNoteFolder: (id: string) => mutate(`/notes/folders/${encodeURIComponent(id)}`, "DELETE", null),
  notes: (signal?: AbortSignal) =>
    request("/notes", notesListResponseSchema, signal),
  note: (noteId: string, signal?: AbortSignal) =>
    request(`/notes/${encodeURIComponent(noteId)}`, noteResponseSchema, signal),
  searchNotes: (input: NoteSearchQuery, signal?: AbortSignal) =>
    request(
      `/notes/search?${searchParams(input)}`,
      notesListResponseSchema,
      signal,
    ),
  createNote: (body: Partial<CreateNoteRequest> = {}) =>
    mutate("/notes", "POST", noteResponseSchema, createNoteRequestSchema.parse(body)),
  createGlobalQuicknote,
  updateNote: (noteId: string, body: UpdateNoteRequest) =>
    mutate(`/notes/${encodeURIComponent(noteId)}`, "PATCH", noteResponseSchema, body),
  moveNote: (noteId: string, body: MoveNoteRequest) =>
    mutate(`/notes/${encodeURIComponent(noteId)}/move`, "POST", noteResponseSchema, body),
  saveNoteContent: (noteId: string, body: SaveNoteContentRequest) =>
    mutate(
      `/notes/${encodeURIComponent(noteId)}/content`,
      "PUT",
      saveNoteContentResponseSchema,
      body,
    ),
  archiveNote: (noteId: string) =>
    mutate(`/notes/${encodeURIComponent(noteId)}`, "DELETE", null),
  restoreNote: (noteId: string) =>
    mutate(`/notes/${encodeURIComponent(noteId)}/restore`, "POST", noteResponseSchema),
};
