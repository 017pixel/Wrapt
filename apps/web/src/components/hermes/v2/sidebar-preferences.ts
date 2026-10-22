import { organizationPolicy } from "./organization-policy";
import type { CollapsibleShelf } from "./sidebar-types";

export type CollapsedShelves = Record<CollapsibleShelf, boolean>;
const defaults: CollapsedShelves = { working: false, snoozed: true, settled: true };
function parse(raw: string | null): CollapsedShelves {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || !("version" in value) || value.version !== organizationPolicy.preferencesVersion || !("collapsed" in value)) return { ...defaults };
    const collapsed = value.collapsed;
    if (!collapsed || typeof collapsed !== "object") return { ...defaults };
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key,
      key in collapsed && typeof collapsed[key as keyof typeof collapsed] === "boolean" ? collapsed[key as keyof typeof collapsed] : fallback])) as CollapsedShelves;
  } catch { return { ...defaults }; }
}
export class SidebarPreferences {
  value: CollapsedShelves = { ...defaults };
  private stop: (() => void) | null = null;
  start(notify: () => void): void {
    if (this.stop) return;
    try { this.value = parse(localStorage.getItem(organizationPolicy.preferencesKey)); } catch { this.value = { ...defaults }; }
    const listener = (event: StorageEvent) => {
      if (event.key !== null && event.key !== organizationPolicy.preferencesKey) return;
      if (event.storageArea && event.storageArea !== localStorage) return;
      this.value = parse(event.newValue); notify();
    };
    window.addEventListener("storage", listener);
    this.stop = () => window.removeEventListener("storage", listener);
  }
  set(shelf: CollapsibleShelf, collapsed: boolean): void {
    this.value = { ...this.value, [shelf]: collapsed };
    try { localStorage.setItem(organizationPolicy.preferencesKey, JSON.stringify({ version: organizationPolicy.preferencesVersion, collapsed: this.value })); } catch { /* Darstellung bleibt im Speicher. */ }
  }
  dispose(): void { this.stop?.(); this.stop = null; }
}
