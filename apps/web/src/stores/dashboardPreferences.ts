import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DashboardConfig, DashboardSection } from "@wrapt/contracts";
import { dashboardSectionRegistry } from "../extensions/dashboardRegistry";
import {
  defaultDashboardArtworkId,
  isDashboardArtworkId,
  type DashboardArtworkId,
} from "../lib/dashboardArtwork";

export const allDashboardSections: DashboardSection[] = [
  "quickActions",
  "server",
  "metrics",
  "services",
  "runtime",
  "diagnostics",
  "usage",
  "commands",
];

export interface DashboardSectionView {
  readonly section: DashboardSection;
  readonly label: string;
  readonly description: string;
}

let cachedRegistryRevision = -1;
let cachedRegistrySections: readonly DashboardSectionView[] = Object.freeze([]);

function dashboardSectionsFromRegistry(): readonly DashboardSectionView[] {
  const snapshot = dashboardSectionRegistry.getSnapshot();
  if (snapshot.revision !== cachedRegistryRevision) {
    cachedRegistryRevision = snapshot.revision;
    cachedRegistrySections = Object.freeze(
      snapshot.sections.map((entry) => ({
        section: entry.value.runtime.legacySectionId,
        label: entry.value.contribution.title,
        description: entry.value.contribution.description ?? "",
      })),
    );
  }
  return cachedRegistrySections;
}

/**
 * Die Dashboard-Bereiche kommen zur Renderzeit aus der Dashboard-Section-
 * Registry (Legacy Built-ins). Config- und LocalStorage-Werte bleiben über
 * den Legacy-Alias unverändert lesbar; die statische `allDashboardSections`
 * bleibt als Persist-Filter und Fallback erhalten.
 */
export function useDashboardSections(): readonly DashboardSectionView[] {
  return useSyncExternalStore(
    dashboardSectionRegistry.subscribe,
    dashboardSectionsFromRegistry,
  );
}

interface DashboardPreferencesState {
  hiddenSections: Set<DashboardSection>;
  artworkEnabled: boolean;
  artworkId: DashboardArtworkId;
  toggleSection: (section: DashboardSection) => void;
  setArtworkEnabled: (enabled: boolean) => void;
  setArtworkId: (artworkId: DashboardArtworkId) => void;
  isVisible: (section: DashboardSection) => boolean;
}

const STORAGE_KEY = "wrapt.dashboard-preferences.v1";
const PERSIST_VERSION = 2;

function validSections(value: unknown): Set<DashboardSection> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((item): item is DashboardSection => typeof item === "string" && allDashboardSections.includes(item as DashboardSection)));
}

export function migrateDashboardPreferences(persisted: unknown) {
  const raw = persisted as { hiddenSections?: unknown } | undefined;
  return {
    hiddenSections: [...validSections(raw?.hiddenSections)],
    artworkEnabled: false,
    artworkId: defaultDashboardArtworkId,
  };
}

export const useDashboardPreferences = create<DashboardPreferencesState>()(
  persist(
    (set, get) => ({
      hiddenSections: new Set<DashboardSection>(),
      artworkEnabled: false,
      artworkId: defaultDashboardArtworkId,
      toggleSection: (section) => set((state) => {
        const next = new Set(state.hiddenSections);
        if (next.has(section)) next.delete(section);
        else next.add(section);
        return { hiddenSections: next };
      }),
      setArtworkEnabled: (artworkEnabled) => set({ artworkEnabled }),
      setArtworkId: (artworkId) => set({ artworkId }),
      isVisible: (section) => !get().hiddenSections.has(section),
    }),
    {
      name: STORAGE_KEY,
      version: PERSIST_VERSION,
      migrate: migrateDashboardPreferences,
      partialize: (state) => ({
        hiddenSections: [...state.hiddenSections],
        artworkEnabled: state.artworkEnabled,
        artworkId: state.artworkId,
      }),
      merge: (persisted, current) => {
        const raw = persisted as { hiddenSections?: unknown; artworkEnabled?: unknown; artworkId?: unknown } | undefined;
        return {
          ...current,
          hiddenSections: validSections(raw?.hiddenSections),
          artworkEnabled: raw?.artworkEnabled === true,
          artworkId: isDashboardArtworkId(raw?.artworkId) ? raw.artworkId : defaultDashboardArtworkId,
        };
      },
    },
  ),
);

export function isDashboardSectionVisible(
  config: DashboardConfig | undefined,
  hiddenSections: ReadonlySet<DashboardSection>,
  section: DashboardSection,
): boolean {
  return (config?.sections[section] ?? true) && !hiddenSections.has(section);
}
