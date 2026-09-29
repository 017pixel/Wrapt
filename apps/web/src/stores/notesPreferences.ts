import { create } from "zustand";
import { persist } from "zustand/middleware";

export const NOTES_SIDEBAR_MIN_WIDTH = 220;
export const NOTES_SIDEBAR_MAX_WIDTH = 420;
export const NOTES_SIDEBAR_DEFAULT_WIDTH = 272;

export function clampNotesSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return NOTES_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(NOTES_SIDEBAR_MAX_WIDTH, Math.max(NOTES_SIDEBAR_MIN_WIDTH, Math.round(width)));
}

interface NotesPreferencesState {
  /** Breite der Seitenleiste in Pixeln (per Ziehen veränderbar). */
  sidebarWidth: number;
  /** Seitenleiste eingeklappt (Desktop); mobil steuert sie das Overlay. */
  sidebarCollapsed: boolean;
  /** Aufgeklappte Seiten im Baum. */
  expanded: Record<string, boolean>;
  /** Eingeklappte Bereiche der Seitenleiste, etwa Favoriten und Privat. */
  collapsedSections: Record<string, boolean>;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleExpanded: (noteId: string) => void;
  toggleSection: (sectionId: string) => void;
  expandNotes: (noteIds: readonly string[]) => void;
}

/** Persistente Ansichtseinstellungen der Notizen-Seitenleiste. */
export const useNotesPreferences = create<NotesPreferencesState>()(
  persist(
    (set) => ({
      sidebarWidth: NOTES_SIDEBAR_DEFAULT_WIDTH,
      sidebarCollapsed: false,
      expanded: {},
      collapsedSections: { trash: true },
      setSidebarWidth: (width) => set({ sidebarWidth: clampNotesSidebarWidth(width) }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleExpanded: (noteId) =>
        set((state) => ({ expanded: { ...state.expanded, [noteId]: !state.expanded[noteId] } })),
      toggleSection: (sectionId) =>
        set((state) => ({
          collapsedSections: {
            ...state.collapsedSections,
            [sectionId]: !state.collapsedSections[sectionId],
          },
        })),
      expandNotes: (noteIds) =>
        set((state) => {
          const next = { ...state.expanded };
          for (const noteId of noteIds) next[noteId] = true;
          return { expanded: next };
        }),
    }),
    { name: "wrapt.notes-preferences.v1", version: 1 },
  ),
);
