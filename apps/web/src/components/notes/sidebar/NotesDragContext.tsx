import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

export const NOTE_DRAG_TYPE = "application/x-wrapt-note";
export const NOTE_SECTION_DRAG_TYPE = "application/x-wrapt-note-section";
const NotesDragContext = createContext<{
  noteId: string | null; setNoteId: (id: string | null) => void;
  sectionId: string | null; setSectionId: (id: string | null) => void;
}>({
  noteId: null, setNoteId: () => undefined,
  sectionId: null, setSectionId: () => undefined,
});
export const useNotesDrag = () => useContext(NotesDragContext);
export function NotesDragProvider({ children }: { children: ReactNode }) {
  const [noteId, setNoteId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  return <NotesDragContext.Provider value={{ noteId, setNoteId, sectionId, setSectionId }}>{children}</NotesDragContext.Provider>;
}
