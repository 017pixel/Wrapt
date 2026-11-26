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
  "wrapt",
  "services",
  "runtime",
  "diagnostics",
  "usage",
  "commands",
];

/** Startreihenfolge entspricht der bisherigen Dashboard-Anordnung. */
export const defaultDashboardSectionOrder: DashboardSection[] = [
  "server",
  "runtime",
  "wrapt",
  "quickActions",
  "services",
  "usage",
  "metrics",
  "diagnostics",
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

export type DashboardSectionMoveDirection = "up" | "down";

interface DashboardPreferencesState {
  hiddenSections: Set<DashboardSection>;
  sectionOrder: DashboardSection[];
  artworkEnabled: boolean;
  artworkId: DashboardArtworkId;
  toggleSection: (section: DashboardSection) => void;
  moveSection: (section: DashboardSection, direction: DashboardSectionMoveDirection) => void;
  setArtworkEnabled: (enabled: boolean) => void;
  setArtworkId: (artworkId: DashboardArtworkId) => void;
  isVisible: (section: DashboardSection) => boolean;
}

const STORAGE_KEY = "wrapt.dashboard-preferences.v1";
const PERSIST_VERSION = 3;

function isDashboardSection(value: unknown): value is DashboardSection {
  return typeof value === "string" && allDashboardSections.includes(value as DashboardSection);
}

function validSections(value: unknown): Set<DashboardSection> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter(isDashboardSection));
}

/** Ergänzt fehlende Bereiche und entfernt Unbekanntes oder Doppeltes. */
function validSectionOrder(value: unknown): DashboardSection[] {
  const ordered: DashboardSection[] = [];
  const seen = new Set<DashboardSection>();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isDashboardSection(item) || seen.has(item)) continue;
      seen.add(item);
      ordered.push(item);
    }
  }
  for (const section of [...defaultDashboardSectionOrder, ...allDashboardSections]) {
    if (seen.has(section)) continue;
    seen.add(section);
    ordered.push(section);
  }
  return ordered;
}

export function migrateDashboardPreferences(persisted: unknown, version = 0) {
  const raw = persisted as {
    hiddenSections?: unknown;
    sectionOrder?: unknown;
    artworkEnabled?: unknown;
    artworkId?: unknown;
  } | undefined;
  const keepArtwork = version >= 2;
  return {
    hiddenSections: [...validSections(raw?.hiddenSections)],
    sectionOrder: validSectionOrder(raw?.sectionOrder),
    artworkEnabled: keepArtwork && raw?.artworkEnabled === true,
    artworkId: keepArtwork && isDashboardArtworkId(raw?.artworkId) ? raw.artworkId : defaultDashboardArtworkId,
  };
}

export const useDashboardPreferences = create<DashboardPreferencesState>()(
  persist(
    (set, get) => ({
      hiddenSections: new Set<DashboardSection>(),
      sectionOrder: [...defaultDashboardSectionOrder],
      artworkEnabled: false,
      artworkId: defaultDashboardArtworkId,
      toggleSection: (section) => set((state) => {
        const next = new Set(state.hiddenSections);
        if (next.has(section)) next.delete(section);
        else next.add(section);
        return { hiddenSections: next };
      }),
      moveSection: (section, direction) => set((state) => {
        const index = state.sectionOrder.indexOf(section);
        if (index < 0) return {};
        const target = direction === "up" ? index - 1 : index + 1;
        const neighbor = state.sectionOrder[target];
        const current = state.sectionOrder[index];
        if (!neighbor || !current) return {};
        const sectionOrder = [...state.sectionOrder];
        sectionOrder[index] = neighbor;
        sectionOrder[target] = current;
        return { sectionOrder };
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
        sectionOrder: state.sectionOrder,
        artworkEnabled: state.artworkEnabled,
        artworkId: state.artworkId,
      }),
      merge: (persisted, current) => {
        const raw = persisted as {
          hiddenSections?: unknown;
          sectionOrder?: unknown;
          artworkEnabled?: unknown;
          artworkId?: unknown;
        } | undefined;
        return {
          ...current,
          hiddenSections: validSections(raw?.hiddenSections),
          sectionOrder: validSectionOrder(raw?.sectionOrder),
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
