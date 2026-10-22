import type { UiSettingKey } from "@wrapt/contracts";
import { settingsAdaptersByKey } from "./adapters";

export const META_STORAGE_KEY = "wrapt.ui-settings-sync.v1";

export interface SyncMeta {
  revisions: Partial<Record<UiSettingKey, number>>;
  pending: Partial<Record<UiSettingKey, number>>;
}

export function serializeSetting(value: unknown): string {
  return JSON.stringify(value) ?? "null";
}

export function emptyMeta(): SyncMeta {
  return { revisions: {}, pending: {} };
}

export function readMeta(): SyncMeta {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(META_STORAGE_KEY) ?? "null") as unknown;
    if (typeof parsed !== "object" || parsed === null) return emptyMeta();
    const raw = parsed as { revisions?: unknown; pending?: unknown };
    const revisions: Partial<Record<UiSettingKey, number>> = {};
    const pending: Partial<Record<UiSettingKey, number>> = {};
    for (const key of settingsAdaptersByKey.keys()) {
      const revision = typeof raw.revisions === "object" && raw.revisions !== null
        ? (raw.revisions as Record<string, unknown>)[key]
        : undefined;
      if (typeof revision === "number" && Number.isInteger(revision) && revision >= 0) revisions[key] = revision;
      const pendingAt = typeof raw.pending === "object" && raw.pending !== null
        ? (raw.pending as Record<string, unknown>)[key]
        : undefined;
      if (typeof pendingAt === "number" && Number.isFinite(pendingAt)) pending[key] = pendingAt;
    }
    return { revisions, pending };
  } catch {
    return emptyMeta();
  }
}

export function writeMeta(meta: SyncMeta): void {
  try {
    window.localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta));
  } catch {
    // Ein gesperrter Speicher verhindert nur den Offline-Abgleich, nicht die Einstellung.
  }
}
