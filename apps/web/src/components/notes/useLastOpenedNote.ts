import { useEffect } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import { useNotesPreferences } from "../../stores/notesPreferences";

interface LastOpenedNoteInput {
  noteId: string | null;
  notes: readonly NoteSummary[];
  windowMode: boolean;
  onSelectNote: (noteId: string) => void;
}

/** Merkt sich die geöffnete Seite und stellt sie ohne Auswahl wieder her. */
export function useLastOpenedNote({ noteId, notes, windowMode, onSelectNote }: LastOpenedNoteInput): void {
  const lastOpenedNoteId = useNotesPreferences((state) => state.lastOpenedNoteId);
  const setLastOpenedNoteId = useNotesPreferences((state) => state.setLastOpenedNoteId);

  useEffect(() => {
    if (!windowMode && noteId !== null) setLastOpenedNoteId(noteId);
  }, [windowMode, noteId, setLastOpenedNoteId]);

  useEffect(() => {
    if (windowMode || noteId !== null || notes.length === 0) return;
    const stored = lastOpenedNoteId !== null ? notes.find((note) => note.id === lastOpenedNoteId && !note.archived) : undefined;
    const fallback = stored ?? notes.find((note) => !note.archived) ?? notes[0];
    if (fallback) onSelectNote(fallback.id);
  }, [windowMode, noteId, notes, lastOpenedNoteId, onSelectNote]);
}
