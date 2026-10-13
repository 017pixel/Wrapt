import type { QueryClient } from "@tanstack/react-query";
import type { Note, NoteResponse, NotesListResponse } from "@wrapt/contracts";

/** Inhalt, Titel und Metadaten betreffen Liste/Suchen; fremde Details pollen selbst. */
export async function invalidateNoteSummaries(client: QueryClient): Promise<void> {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["notes", "list"], exact: true }),
    client.invalidateQueries({ queryKey: ["notes", "search"] }),
  ]);
}

export function cacheSavedNote(client: QueryClient, note: Note): void {
  client.setQueryData<NoteResponse>(["notes", "detail", note.id], (current) =>
    current?.note && current.note.revision > note.revision ? current : { note });
}

export async function publishSavedNote(client: QueryClient, note: Note): Promise<void> {
  cacheSavedNote(client, note);
  await invalidateNoteSummaries(client);
}

/** Verschieben normiert nur die Geschwister der neuen Ebene. */
export async function publishMovedNote(client: QueryClient, note: Note): Promise<void> {
  const list = client.getQueryData<NotesListResponse>(["notes", "list"]);
  cacheSavedNote(client, note);
  await Promise.all([
    invalidateNoteSummaries(client),
    client.invalidateQueries({
      predicate: (query) => {
        if (query.queryKey[0] !== "notes" || query.queryKey[1] !== "detail" || query.queryKey[2] === note.id) return false;
        const entry = list?.notes.find((entry) => entry.id === query.queryKey[2]) ?? (query.state.data as NoteResponse | undefined)?.note;
        return entry?.parentId === note.parentId && !entry.archived;
      },
    }),
  ]);
}

/** Aufgelöste Ordner ändern folderId ihrer Wurzelseiten, keine Inhalte. */
export async function invalidateNoteFolder(client: QueryClient, folderId?: string): Promise<void> {
  const list = client.getQueryData<NotesListResponse>(["notes", "list"]);
  await Promise.all([
    invalidateNoteSummaries(client),
    ...(folderId ? [client.invalidateQueries({
      predicate: (query) => {
        if (query.queryKey[0] !== "notes" || query.queryKey[1] !== "detail") return false;
        const entry = list?.notes.find((entry) => entry.id === query.queryKey[2]) ?? (query.state.data as NoteResponse | undefined)?.note;
        return entry?.folderId === folderId;
      },
    })] : []),
  ]);
}
