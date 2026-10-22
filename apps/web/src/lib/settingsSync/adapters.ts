import type { UiSettingKey, UiSettingValue } from "@wrapt/contracts";
import { useAppPreferences } from "../../stores/appPreferences";
import { useDashboardPreferences } from "../../stores/dashboardPreferences";
import { useLayoutStore } from "../../stores/layout";
import { useSidebarPreferences } from "../../stores/sidebarPreferences";
import { useUsagePreferences } from "../../stores/usagePreferences";
import {
  OVERLAY_TRANSPARENCY_STORAGE_KEY,
  normalizeOverlayTransparency,
  readOverlayTransparency,
  subscribeOverlayTransparency,
  writeOverlayTransparency,
} from "../overlayTransparency";

export interface SettingsAdapter {
  readonly key: UiSettingKey;
  readonly storageKey: string;
  /** Vollständiger Wert, wie er auf dem Server liegt. */
  read(): UiSettingValue;
  /** Wendet einen Serverwert lokal an, ohne ihn erneut zu senden. */
  apply(value: unknown): Promise<void> | void;
  /** Meldet lokale Änderungen. */
  subscribe(listener: () => void): () => void;
  /** Ob dieser Client bereits einen eigenen Wert gespeichert hat. */
  hasLocalValue(): boolean;
}

interface PersistedStore<T> {
  getState(): T;
  subscribe(listener: (state: T, previousState: T) => void): () => void;
  persist: {
    rehydrate(): Promise<void> | void;
    getOptions(): {
      partialize?: (state: T) => unknown;
      version?: number;
    };
  };
}

function envelopeFrom<T>(store: PersistedStore<T>): { state: unknown; version: number } {
  const options = store.persist.getOptions();
  const state = options.partialize ? options.partialize(store.getState()) : store.getState();
  return { state, version: options.version ?? 0 };
}

function readEnvelope(value: unknown): { state: unknown; version: number } | null {
  if (typeof value !== "object" || value === null || !("state" in value)) return null;
  const candidate = value as { state?: unknown; version?: unknown };
  return {
    state: candidate.state,
    version: typeof candidate.version === "number" ? candidate.version : 0,
  };
}

function toJsonValue(value: unknown): UiSettingValue {
  return JSON.parse(JSON.stringify(value)) as UiSettingValue;
}

function persistedStoreAdapter<T>(
  key: UiSettingKey,
  storageKey: string,
  store: PersistedStore<T>,
): SettingsAdapter {
  return {
    key,
    storageKey,
    read: () => toJsonValue(envelopeFrom(store)),
    apply: async (value) => {
      const envelope = readEnvelope(value);
      if (!envelope) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(envelope));
      } catch {
        // Gesperrter Speicher: Der Store wird trotzdem direkt aus dem Serverwert
        // rehydriert, weil persist.rehydrate den Speicher nur als Quelle nutzt.
      }
      await Promise.resolve(store.persist.rehydrate());
    },
    subscribe: (listener) => store.subscribe(() => listener()),
    hasLocalValue: () => {
      try {
        return window.localStorage.getItem(storageKey) !== null;
      } catch {
        return false;
      }
    },
  };
}

function overlayTransparencyAdapter(): SettingsAdapter {
  return {
    key: "overlayTransparency",
    storageKey: OVERLAY_TRANSPARENCY_STORAGE_KEY,
    read: () => readOverlayTransparency(),    apply: (value) => {
      const intensity = typeof value === "number" ? normalizeOverlayTransparency(value) : 100;
      writeOverlayTransparency(intensity);
    },
    subscribe: (listener) => subscribeOverlayTransparency(() => listener()),
    hasLocalValue: () => {
      try {
        return window.localStorage.getItem(OVERLAY_TRANSPARENCY_STORAGE_KEY) !== null;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Einzige Registrierungsstelle für clientweite Einstellungen. Neue Werte
 * brauchen einen Schlüssel in `@wrapt/contracts` und einen Adapter hier.
 */
export const settingsAdapters: readonly SettingsAdapter[] = [
  persistedStoreAdapter("appPreferences", "wrapt.app-preferences.v1", useAppPreferences),
  persistedStoreAdapter("sidebarPreferences", "wrapt.sidebar-preferences.v1", useSidebarPreferences),
  persistedStoreAdapter("dashboardPreferences", "wrapt.dashboard-preferences.v1", useDashboardPreferences),
  persistedStoreAdapter("layout", "wrapt.layout.v1", useLayoutStore),
  persistedStoreAdapter("usagePreferences", "wrapt.usage-preferences.v1", useUsagePreferences),
  overlayTransparencyAdapter(),
];

export const settingsAdaptersByKey = new Map(settingsAdapters.map((adapter) => [adapter.key, adapter]));
