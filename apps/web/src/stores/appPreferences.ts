import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { defaultShortcuts, normalizeShortcuts, type ShortcutPreferences } from "../config/shortcuts";
import { allPageRoutes, type PageRouteId } from "./sidebarPreferences";

/**
 * Welche Seite beim Öffnen der Workbench (Root-Pfad "/") geladen wird.
 * Das Dashboard bleibt der Default; alle registrierten Hauptseiten sind wählbar.
 */
const DEFAULT_PAGE: PageRouteId = "dashboard";

function isPageRouteId(value: unknown): value is PageRouteId {
  return (
    typeof value === "string" &&
    (allPageRoutes as readonly string[]).includes(value)
  );
}

interface AppPreferencesState {
  defaultPage: PageRouteId;
  hermesV2Enabled: boolean;
  shortcuts: ShortcutPreferences;
  setShortcuts: (shortcuts: ShortcutPreferences) => void;
  setDefaultPage: (page: PageRouteId) => void;
  setHermesV2Enabled: (enabled: boolean) => void;
}

const STORAGE_KEY = "wrapt.app-preferences.v1";
const PERSIST_VERSION = 6;
let readingStorageEvent = false;

function readPreferences(key: string): string | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  try {
    JSON.parse(raw);
    return raw;
  } catch {
    // Beschädigte UI-Präferenzen werden wie fehlende Daten mit sicheren Defaults geladen.
    return null;
  }
}

function preferences(value: unknown): Pick<AppPreferencesState, "defaultPage" | "hermesV2Enabled" | "shortcuts"> {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    defaultPage: isPageRouteId(raw.defaultPage) ? raw.defaultPage : DEFAULT_PAGE,
    hermesV2Enabled: raw.hermesV2Enabled === true,
    shortcuts: normalizeShortcuts(raw.shortcuts),
  };
}

export const useAppPreferences = create<AppPreferencesState>()(
  persist(
    (set) => ({
      defaultPage: DEFAULT_PAGE,
      hermesV2Enabled: false,
      shortcuts: normalizeShortcuts(defaultShortcuts),
      setShortcuts: (shortcuts) => set({ shortcuts: normalizeShortcuts(shortcuts) }),
      setDefaultPage: (page) => set({ defaultPage: page }),
      setHermesV2Enabled: (enabled) => set({ hermesV2Enabled: enabled }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => ({
        getItem: readPreferences,
        setItem: (key, value) => { if (!readingStorageEvent) localStorage.setItem(key, value); },
        removeItem: (key) => localStorage.removeItem(key),
      })),
      partialize: (state) => ({ defaultPage: state.defaultPage, hermesV2Enabled: state.hermesV2Enabled, shortcuts: state.shortcuts }),
      version: PERSIST_VERSION,
      // Der Speicherschlüssel bleibt stabil, damit die bisherige Startseite erhalten bleibt.
      migrate: (persisted) => preferences(persisted),
      merge: (persisted, current) => ({ ...current, ...preferences(persisted) }),
    },
  ),
);

/** Rehydrate liest ohne erneutes Schreiben; der App-Lebenszyklus entfernt den Listener. */
export function subscribeAppPreferencesStorage(): () => void {
  const sync = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    readingStorageEvent = true;
    try {
      // localStorage wird synchron gelesen; auch eine Migration erzeugt hier kein Echo.
      void useAppPreferences.persist.rehydrate();
    } finally {
      readingStorageEvent = false;
    }
  };
  window.addEventListener("storage", sync);
  return () => window.removeEventListener("storage", sync);
}
