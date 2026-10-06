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
  /** Eingeklappte Bereiche der Seitenleiste, etwa Favoriten und alle Notizen. */
  collapsedSections: Record<string, boolean>;
  /** Zuletzt geöffnete Seite; wird beim Start ohne Auswahl wiederhergestellt. */
  lastOpenedNoteId: string | null;
  sectionOrder: string[];
  favoriteOrder: string[];
  moveSection: (id: string, target: string, available?: string[]) => void;
  moveFavorite: (id: string, target: string, available?: string[]) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleExpanded: (noteId: string) => void;
  toggleSection: (sectionId: string) => void;
  expandNotes: (noteIds: readonly string[]) => void;
  setLastOpenedNoteId: (noteId: string | null) => void;
}

/** Persistente Ansichtseinstellungen der Notizen-Seitenleiste. */
export const useNotesPreferences = create<NotesPreferencesState>()(
  persist(
    (set) => ({
      sidebarWidth: NOTES_SIDEBAR_DEFAULT_WIDTH,
      sidebarCollapsed: false,
      expanded: {},
      collapsedSections: { trash: true },
      lastOpenedNoteId: null,
      sectionOrder: ["recent", "favorites", "all", "trash"],
      favoriteOrder: [],
      moveSection: (id, target, available = []) => set((state) => ({ sectionOrder: moveBefore([...state.sectionOrder, ...available], id, target) })),
      moveFavorite: (id, target, available = []) => set((state) => ({ favoriteOrder: moveBefore([...state.favoriteOrder, ...available], id, target) })),
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
      setLastOpenedNoteId: (noteId) => set({ lastOpenedNoteId: noteId }),
    }),
    {
      name: "wrapt.notes-preferences.v1", version: 2,
      migrate: (persisted) => {
        const state = persisted as Partial<NotesPreferencesState>;
        return { ...state, sectionOrder: ["recent", "favorites", "all", "trash"], favoriteOrder: [],
          collapsedSections: { ...state.collapsedSections, all: state.collapsedSections?.private ?? false } };
      },
    },
  ),
);

/** Unbekannte Einträge werden aufgenommen, doppelte Einträge entfernt. */
export function moveBefore(order: readonly string[], id: string, target: string): string[] {
  if (id === target) return [...new Set(order)];
  const next = [...new Set(order)].filter((entry) => entry !== id);
  const index = next.indexOf(target);
  next.splice(index < 0 ? next.length : index, 0, id);
  return next;
}
