import { useEffect } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import { useRouteActivity } from "../../lib/routeActivity";
import { useNotesPreferences } from "../../stores/notesPreferences";

interface LastOpenedNoteInput {
  noteId: string | null;
  notes: readonly NoteSummary[];
  windowMode: boolean;
  onSelectNote: (noteId: string) => void;
}

/** Merkt sich die geöffnete Seite und stellt sie ohne Auswahl wieder her. */
export function useLastOpenedNote({ noteId, notes, windowMode, onSelectNote }: LastOpenedNoteInput): void {
  const routeActive = useRouteActivity();
  const lastOpenedNoteId = useNotesPreferences((state) => state.lastOpenedNoteId);
  const setLastOpenedNoteId = useNotesPreferences((state) => state.setLastOpenedNoteId);

  useEffect(() => {
    if (routeActive && !windowMode && noteId !== null) setLastOpenedNoteId(noteId);
  }, [routeActive, windowMode, noteId, setLastOpenedNoteId]);

  useEffect(() => {
    if (!routeActive || windowMode || noteId !== null || notes.length === 0) return;
    const stored = lastOpenedNoteId !== null ? notes.find((note) => note.id === lastOpenedNoteId && !note.archived) : undefined;
    const fallback = stored ?? notes.find((note) => !note.archived) ?? notes[0];
    if (fallback) onSelectNote(fallback.id);
  }, [routeActive, windowMode, noteId, notes, lastOpenedNoteId, onSelectNote]);
}
