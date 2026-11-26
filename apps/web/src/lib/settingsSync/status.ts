import { create } from "zustand";

interface SettingsSyncStatus {
  error: string | null;
  retry: (() => void) | null;
  setError(error: string | null): void;
  setRetry(retry: (() => void) | null): void;
  requestRetry(): void;
}

/** Sichtbarer Zustand des Einstellungsabgleichs (F-23). */
export const useSettingsSyncStatus = create<SettingsSyncStatus>()((set, get) => ({
  error: null,
  retry: null,
  setError: (error) => set({ error }),
  setRetry: (retry) => set({ retry }),
  requestRetry: () => {
    set({ error: null });
    get().retry?.();
  },
}));
