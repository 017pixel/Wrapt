import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** Ein gemeinsamer CPU-/RAM-Messpunkt für den Verlauf des Dashboards. */
export interface MetricsSample {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
}

/** 25 Messpunkte reichen für einen kurzen Verlauf und bleiben kompakt. */
const MAX_SAMPLES = 25;
const MAX_RESTORED_AGE_MS = 5 * 60_000;
const STORAGE_KEY = "wrapt.dashboard.metrics-history.v1";

interface MetricsHistoryState {
  samples: MetricsSample[];
  merge: (samples: readonly MetricsSample[]) => void;
  clear: () => void;
}

const memoryOnlyStorage: Storage = {
  get length() { return 0; },
  clear: () => undefined,
  getItem: () => null,
  key: () => null,
  removeItem: () => undefined,
  setItem: () => undefined,
};

function restoreRecentSamples(value: unknown): MetricsSample[] {
  if (!Array.isArray(value)) return [];
  const now = Date.now();
  return value.filter((sample): sample is MetricsSample => {
    if (!sample || typeof sample !== "object") return false;
    const candidate = sample as Partial<MetricsSample>;
    const { timestamp, cpuPercent, memoryPercent } = candidate;
    return typeof timestamp === "number" && Number.isFinite(timestamp)
      && timestamp >= now - MAX_RESTORED_AGE_MS && timestamp <= now
      && typeof cpuPercent === "number" && Number.isFinite(cpuPercent)
      && cpuPercent >= 0 && cpuPercent <= 100
      && typeof memoryPercent === "number" && Number.isFinite(memoryPercent)
      && memoryPercent >= 0 && memoryPercent <= 100;
  }).slice(-MAX_SAMPLES);
}

/**
 * Der Server liefert den Hintergrundverlauf. Der Store hält ihn für alle
 * Dashboard-Kacheln und über kurze Verbindungsunterbrechungen hinweg bereit.
 */
export const useMetricsHistory = create<MetricsHistoryState>()(
  persist(
    (set) => ({
      samples: [],
      merge: (samples) =>
        set((state) => {
          const now = Date.now();
          const merged = new Map<number, MetricsSample>();
          for (const sample of [...state.samples, ...samples]) {
            if (sample.timestamp > now - MAX_RESTORED_AGE_MS && sample.timestamp <= now) {
              merged.set(sample.timestamp, sample);
            }
          }
          const next = [...merged.values()].sort((left, right) => left.timestamp - right.timestamp);
          return { samples: next.length > MAX_SAMPLES ? next.slice(-MAX_SAMPLES) : next };
        }),
      clear: () => set({ samples: [] }),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => {
        try {
          return window.localStorage ?? memoryOnlyStorage;
        } catch {
          return memoryOnlyStorage;
        }
      }),
      partialize: (state) => ({ samples: state.samples }),
      merge: (persisted, current) => {
        const restored = persisted as Partial<MetricsHistoryState> | undefined;
        return { ...current, samples: restoreRecentSamples(restored?.samples) };
      },
    },
  ),
);

export type TrendDirection = "up" | "down" | "stable";

export interface Trend {
  direction: TrendDirection;
  /** Differenz zwischen jüngerem und älterem Mittel in der Einheit der Reihe. */
  delta: number;
}

/**
 * Vergleicht das Mittel der letzten fünf Punkte mit dem der fünf davor.
 * `threshold` verhindert, dass normales Rauschen als Trend gemeldet wird.
 */
export function computeTrend(values: readonly number[], threshold = 1): Trend {
  if (values.length < 6) return { direction: "stable", delta: 0 };
  const recent = values.slice(-5);
  const older = values.slice(-10, -5);
  if (older.length === 0) return { direction: "stable", delta: 0 };
  const average = (list: readonly number[]) => list.reduce((total, value) => total + value, 0) / list.length;
  const delta = average(recent) - average(older);
  if (delta > threshold) return { direction: "up", delta };
  if (delta < -threshold) return { direction: "down", delta };
  return { direction: "stable", delta };
}
