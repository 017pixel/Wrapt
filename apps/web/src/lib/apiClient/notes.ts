import {
  createNoteRequestSchema,
  noteFolderResponseSchema,
  noteResponseSchema,
  noteDetailResponseSchema,
  notesListResponseSchema,
  saveNoteContentResponseSchema,
  saveNoteContentSummaryResponseSchema,
  type CreateNoteRequest,
  type NoteResponse,
  type SaveNoteContentResponse,
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

/**
 * Letzter Vollstand je Notiz. Der 3-s-Poll fragt mit `sinceRevision`; bei
 * unveränderter Revision antwortet der Server nur mit wenigen Bytes und der
 * Client behält den vorhandenen Inhalt.
 */
const noteCache = new Map<string, NoteResponse>();
const NOTE_CACHE_LIMIT = 20;

function cacheNote(response: NoteResponse): void {
  noteCache.delete(response.note.id);
  noteCache.set(response.note.id, response);
  const oldest = noteCache.keys().next().value;
  if (oldest !== undefined && noteCache.size > NOTE_CACHE_LIMIT) noteCache.delete(oldest);
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
  note: async (noteId: string, signal?: AbortSignal): Promise<NoteResponse> => {
    const path = `/notes/${encodeURIComponent(noteId)}`;
    const cached = noteCache.get(noteId);
    const response = await request(`${path}${cached ? `?sinceRevision=${cached.note.revision}` : ""}`, noteDetailResponseSchema, signal);
    if ("unchanged" in response) return cached ?? request(path, noteResponseSchema, signal);
    cacheNote(response);
    return response;
  },
  searchNotes: (input: NoteSearchQuery, signal?: AbortSignal) =>
    request(
      `/notes/search?${searchParams(input)}`,
      notesListResponseSchema,
      signal,
    ),
  createNote: async (body: Partial<CreateNoteRequest> = {}) => {
    const response = await mutate("/notes", "POST", noteResponseSchema, createNoteRequestSchema.parse(body));
    if (response) cacheNote(response);
    return response;
  },
  duplicateNote: async (noteId: string) => {
    const response = await mutate(`/notes/${encodeURIComponent(noteId)}/duplicate`, "POST", noteResponseSchema);
    if (response) cacheNote(response);
    return response;
  },
  createGlobalQuicknote,
  updateNote: async (noteId: string, body: UpdateNoteRequest) => {
    const response = await mutate(`/notes/${encodeURIComponent(noteId)}`, "PATCH", noteResponseSchema, body);
    if (response) cacheNote(response);
    return response;
  },
  moveNote: async (noteId: string, body: MoveNoteRequest) => {
    const response = await mutate(`/notes/${encodeURIComponent(noteId)}/move`, "POST", noteResponseSchema, body);
    if (response) cacheNote(response);
    return response;
  },
  saveNoteContent: async (noteId: string, body: SaveNoteContentRequest): Promise<SaveNoteContentResponse | undefined> => {
    const path = `/notes/${encodeURIComponent(noteId)}/content`;
    const cached = noteCache.get(noteId);
    if (cached) {
      const result = await mutate(`${path}?response=summary`, "PUT", saveNoteContentSummaryResponseSchema, body);
      if (!result) return undefined;
      if (result.status === "conflict") {
        cacheNote({ note: result.note });
        return { status: "conflict", note: result.note };
      }
      const note = { ...cached.note, content: body.content, revision: result.summary.revision, updatedAt: result.summary.updatedAt };
      cacheNote({ note });
      return { status: "saved", note };
    }
    const result = await mutate(path, "PUT", saveNoteContentResponseSchema, body);
    if (!result) return undefined;
    cacheNote({ note: result.note });
    return result;
  },
  archiveNote: (noteId: string) =>
    mutate(`/notes/${encodeURIComponent(noteId)}`, "DELETE", null),
  restoreNote: (noteId: string) =>
    mutate(`/notes/${encodeURIComponent(noteId)}/restore`, "POST", noteResponseSchema),
};
