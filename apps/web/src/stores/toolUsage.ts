import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ToolUsageEntry {
  count: number;
  lastOpenedAt: number;
}

interface ToolUsageState {
  entries: Record<string, ToolUsageEntry>;
  record: (toolId: string) => void;
}

const STORAGE_KEY = "wrapt.tool-usage.v1";

export const useToolUsage = create<ToolUsageState>()(
  persist(
    (set) => ({
      entries: {},
      record: (toolId) => set((state) => ({
        entries: {
          ...state.entries,
          [toolId]: {
            count: (state.entries[toolId]?.count ?? 0) + 1,
            lastOpenedAt: Date.now(),
          },
        },
      })),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);

export function rankedToolIds(
  entries: Readonly<Record<string, ToolUsageEntry>>,
  availableIds: readonly string[],
  limit = 3,
): string[] {
  const availableOrder = new Map(availableIds.map((id, index) => [id, index]));
  return [...availableIds]
    .sort((left, right) => {
      const leftUsage = entries[left];
      const rightUsage = entries[right];
      const countDelta = (rightUsage?.count ?? 0) - (leftUsage?.count ?? 0);
      if (countDelta !== 0) return countDelta;
      const timeDelta = (rightUsage?.lastOpenedAt ?? 0) - (leftUsage?.lastOpenedAt ?? 0);
      if (timeDelta !== 0) return timeDelta;
      return (availableOrder.get(left) ?? 0) - (availableOrder.get(right) ?? 0);
    })
    .slice(0, Math.max(0, limit));
}

export function recordToolUsage(toolId: string): void {
  useToolUsage.getState().record(toolId);
}
