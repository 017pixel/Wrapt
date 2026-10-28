import { create } from "zustand";
import { persist } from "zustand/middleware";

export const NOTES_EDITOR_EVENT = "wrapt:notes-editor";
export const QUICK_NOTE_EVENT = "wrapt:quick-note";
export interface NoteWindowRect { x: number; y: number; width: number; height: number }
export function fitNoteWindow(rect: NoteWindowRect, viewport: { width: number; height: number }): NoteWindowRect {
  const width = Math.min(Math.max(280, rect.width), Math.max(200, viewport.width - 16));
  const height = Math.min(Math.max(240, rect.height), Math.max(160, viewport.height - 16));
  return { width, height, x: Math.max(8, Math.min(rect.x, viewport.width - width - 8)), y: Math.max(8, Math.min(rect.y, viewport.height - height - 8)) };
}
interface QuickNoteState {
  open: boolean;
  focusRequest: number;
  noteId: string | null;
  rect: NoteWindowRect;
  show(): void;
  close(): void;
  setNoteId(id: string | null): void;
  setRect(rect: NoteWindowRect): void;
}
export const useQuickNote = create<QuickNoteState>()(persist((set) => ({
  open: false, focusRequest: 0, noteId: null,
  rect: { x: 120, y: 100, width: 520, height: 420 },
  show: () => set((state) => ({ open: true, focusRequest: state.focusRequest + 1 })),
  close: () => set({ open: false }),
  setNoteId: (noteId) => set({ noteId }),
  setRect: (rect) => set({ rect }),
}), { name: "wrapt.quick-note", version: 1, partialize: ({ noteId, rect }) => ({ noteId, rect }) }));

export function openQuickNote() { window.dispatchEvent(new Event(QUICK_NOTE_EVENT, { cancelable: true })); }
