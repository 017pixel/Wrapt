import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SidebarSectionKey = "workspace" | "tools" | "footer";

export type PageRouteId =
  | "dashboard" | "projects"
  | "t3-code" | "hermes-agent" | "codex" | "opencode" | "claude" | "code-editor" | "previews" | "terminal" | "files" | "ki-skills"
  | "notizen" | "plugins" | "usage" | "settings";

const allPageRoutes: PageRouteId[] = [
  "dashboard", "projects",
  "t3-code", "hermes-agent", "codex", "opencode", "claude", "code-editor", "previews", "terminal", "files", "ki-skills",
  "notizen", "plugins", "usage", "settings",
];

interface SidebarPreferencesState {
  collapsedSections: Record<SidebarSectionKey, boolean>;
  hiddenPages: Set<string>;
  explicitlyVisibleDefaultPages: Set<string>;
  navigationOrder: string[];
  navigationReorderEnabled: boolean;
  toggleSection: (section: SidebarSectionKey) => void;
  togglePage: (page: PageRouteId) => void;
  toggleNavigationReorder: () => void;
  moveNavigationBefore: (dragId: string, targetId: string, availableIds: string[], after?: boolean) => void;
  isPageVisible: (page: PageRouteId) => boolean;
}

const STORAGE_KEY = "wrapt.sidebar-preferences.v1";
const PERSIST_VERSION = 7;
const DEFAULT_COLLAPSED_SECTIONS: Record<SidebarSectionKey, boolean> = {
  workspace: false,
  tools: false,
  footer: false,
};

interface PersistedSidebarPreferences {
  collapsedSections?: Partial<Record<string, boolean>>;
  hiddenPages?: string[];
  explicitlyVisibleDefaultPages?: string[];
  navigationOrder?: string[];
  navigationReorderEnabled?: boolean;
}

export function migrateSidebarPreferences(persisted: unknown, version = 3) {
  const raw = persisted as PersistedSidebarPreferences | undefined;
  const oldSections = raw?.collapsedSections ?? {};
  const collapsedSections = Object.fromEntries(
    Object.entries(DEFAULT_COLLAPSED_SECTIONS).map(([key, fallback]) => [key, oldSections[key] ?? fallback]),
  ) as Record<SidebarSectionKey, boolean>;
  if (version < 4) {
    // Der alte Werkzeugbereich verwendete vor Version 4 einen anderen Schlüssel.
    collapsedSections.tools = oldSections["orbit-projects"] ?? false;
  }
  return {
    collapsedSections,
    hiddenPages: (raw?.hiddenPages ?? []).filter((page) => page !== "workbench"),
    explicitlyVisibleDefaultPages: (raw?.explicitlyVisibleDefaultPages ?? []).filter((page) => page !== "workbench"),
    navigationOrder: (raw?.navigationOrder ?? []).filter((id) => !id.startsWith("wrapt.orbit.")),
    navigationReorderEnabled: version < 6 ? true : (raw?.navigationReorderEnabled ?? true),
  };
}

// Alle Einträge bleiben über die Einstellungen aktivierbar.
const DEFAULT_HIDDEN_PAGES: ReadonlySet<PageRouteId> = new Set<PageRouteId>(["codex", "opencode", "claude"]);

// Ohne die Einstellungen käme man an die Sichtbarkeits-Schalter nicht mehr heran.
// Diese Seite bleibt deshalb immer erreichbar, egal was im Speicher steht.
const ALWAYS_VISIBLE_PAGES: ReadonlySet<PageRouteId> = new Set<PageRouteId>(["settings"]);

// Ein alter Speicherstand könnte die Einstellungen ausgeblendet haben — hier wieder einsammeln.
const persistedHiddenPages = (raw: string[] | undefined): Set<string> =>
  new Set((raw ?? []).filter((page) => page !== "workbench" && !ALWAYS_VISIBLE_PAGES.has(page as PageRouteId)));

const defaultHiddenPages = (): Set<string> => new Set(DEFAULT_HIDDEN_PAGES);

function mergedHiddenPages(raw: { hiddenPages?: string[]; explicitlyVisibleDefaultPages?: string[] } | undefined): Set<string> {
  const hidden = persistedHiddenPages(raw?.hiddenPages);
  const explicitlyVisible = new Set((raw?.explicitlyVisibleDefaultPages ?? []).filter((page) => DEFAULT_HIDDEN_PAGES.has(page as PageRouteId)));
  if (raw?.explicitlyVisibleDefaultPages === undefined) {
    for (const page of DEFAULT_HIDDEN_PAGES) hidden.add(page);
  } else {
    for (const page of explicitlyVisible) hidden.delete(page);
    for (const page of DEFAULT_HIDDEN_PAGES) {
      if (!explicitlyVisible.has(page)) hidden.add(page);
    }
  }
  return hidden;
}

export const useSidebarPreferences = create<SidebarPreferencesState>()(
  persist(
    (set, get) => ({
      collapsedSections: { ...DEFAULT_COLLAPSED_SECTIONS },
      hiddenPages: defaultHiddenPages(),
      explicitlyVisibleDefaultPages: new Set<string>(),
      navigationOrder: [],
      navigationReorderEnabled: true,
      toggleSection: (section) => set((state) => ({
        collapsedSections: { ...state.collapsedSections, [section]: !state.collapsedSections[section] },
      })),
      togglePage: (page) => set((state) => {
        if (ALWAYS_VISIBLE_PAGES.has(page)) return state;
        const next = new Set(state.hiddenPages);
        const explicitlyVisible = new Set(state.explicitlyVisibleDefaultPages);
        if (next.has(page)) {
          next.delete(page);
          if (DEFAULT_HIDDEN_PAGES.has(page)) explicitlyVisible.add(page);
        } else {
          next.add(page);
          explicitlyVisible.delete(page);
        }
        return { hiddenPages: next, explicitlyVisibleDefaultPages: explicitlyVisible };
      }),
      toggleNavigationReorder: () => set((state) => ({ navigationReorderEnabled: !state.navigationReorderEnabled })),
      moveNavigationBefore: (dragId, targetId, availableIds, after = false) => set((state) => {
        if (dragId === targetId || !availableIds.includes(dragId) || !availableIds.includes(targetId)) return state;
        const ordered = [...state.navigationOrder, ...availableIds.filter((id) => !state.navigationOrder.includes(id))];
        const withoutDrag = ordered.filter((id) => id !== dragId);
        const targetIndex = withoutDrag.indexOf(targetId);
        withoutDrag.splice(targetIndex < 0 ? withoutDrag.length : targetIndex + Number(after), 0, dragId);
        if (withoutDrag.every((id, index) => id === state.navigationOrder[index]) && withoutDrag.length === state.navigationOrder.length) return state;
        return { navigationOrder: withoutDrag };
      }),
      isPageVisible: (page) => ALWAYS_VISIBLE_PAGES.has(page) || !get().hiddenPages.has(page),
    }),
    {
      name: STORAGE_KEY,
      partialize: (state) => ({
        collapsedSections: state.collapsedSections,
        hiddenPages: [...state.hiddenPages],
        explicitlyVisibleDefaultPages: [...state.explicitlyVisibleDefaultPages],
        navigationOrder: state.navigationOrder,
        navigationReorderEnabled: state.navigationReorderEnabled,
      }),
      version: PERSIST_VERSION,
      migrate: migrateSidebarPreferences,
      merge: (persisted, current) => {
        const raw = migrateSidebarPreferences(persisted, PERSIST_VERSION);
        return {
          ...current,
          collapsedSections: { ...current.collapsedSections, ...(raw?.collapsedSections ?? {}) },
          hiddenPages: mergedHiddenPages(raw),
          explicitlyVisibleDefaultPages: new Set(raw?.explicitlyVisibleDefaultPages ?? []),
          navigationOrder: (raw?.navigationOrder ?? []).filter((id) => !id.startsWith("wrapt.orbit.")),
          navigationReorderEnabled: raw?.navigationReorderEnabled ?? true,
        };
      },
    },
  ),
);

/**
 * Reine Variante von `isPageVisible`. Die Store-Methode ist über Renders hinweg
 * dieselbe Funktion — ein `useMemo` mit ihr als Abhängigkeit würde bei geänderter
 * Sichtbarkeit nie neu rechnen. Hier hängt das Ergebnis sichtbar am Set.
 */
export function isPageVisibleIn(hiddenPages: ReadonlySet<string>, page: PageRouteId): boolean {
  return ALWAYS_VISIBLE_PAGES.has(page) || !hiddenPages.has(page);
}


export { allPageRoutes };
