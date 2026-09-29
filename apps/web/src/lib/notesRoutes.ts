/** URL-Bau für Notizen; berücksichtigt den Basispfad der Auslieferung. */

function basePath(): string {
  return import.meta.env.BASE_URL.replace(/\/$/, "");
}

/** Adresse des Notizen-Workspace, optional mit geöffneter Notiz. */
export function notesWorkspaceUrl(noteId?: string, origin = window.location.origin): string {
  const query = noteId === undefined ? "" : `?note=${encodeURIComponent(noteId)}`;
  return new URL(`${basePath()}/notizen${query}`, origin).toString();
}

/** Adresse des eigenständigen Notizfensters. */
export function notesWindowUrl(noteId: string, origin = window.location.origin): string {
  return new URL(`${basePath()}${notesWindowPath(noteId)}`, origin).toString();
}

/** Navigator-Pfad für einen Notizwechsel innerhalb des eigenständigen Fensters. */
export function notesWindowPath(noteId: string): string {
  return `/notizen/fenster/${encodeURIComponent(noteId)}`;
}

/** Navigator-Pfad relativ zum Basispfad (für SPA-Navigation). */
export function notesWorkspacePath(noteId?: string): string {
  return noteId === undefined ? "/notizen" : `/notizen?note=${encodeURIComponent(noteId)}`;
}
