import type { SidebarRowView, SidebarShelf } from "./sidebar-types";
import { sourceLabel } from "./sidebar-format";

/** Sichtmodus der Seitenleiste: welche Shelfs sichtbar sind. */
export type SidebarViewMode = "all" | "attention" | "pinned" | "open";

/** Eine Auswahl mit sichtbarem deutschen Namen. */
export interface SidebarChoice<T extends string> {
  id: T;
  label: string;
}

/** Die vier ehrlichen Sichtmodi; jeder zeigt echte Zeilen der Oberfläche. */
export const VIEW_MODES: readonly SidebarChoice<SidebarViewMode>[] = [
  { id: "all", label: "Alle Sitzungen" },
  { id: "attention", label: "Nur mit Bedarf" },
  { id: "pinned", label: "Nur angeheftete" },
  { id: "open", label: "Ohne Erledigte" },
];

const MODE_SHELVES: Record<SidebarViewMode, readonly SidebarShelf[] | null> = {
  all: null,
  attention: ["needs-input"],
  pinned: ["pinned"],
  open: ["needs-input", "pinned", "working", "active", "snoozed"],
};

/** Shelfs eines Sichtmodus; null bedeutet: alle Shelfs. */
export function shelvesForMode(mode: SidebarViewMode): readonly SidebarShelf[] | null {
  return MODE_SHELVES[mode];
}

/** Projekte der geladenen Zeilen als Filterauswahl. */
export function projectChoices(
  rows: readonly SidebarRowView[],
): readonly SidebarChoice<string>[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const id = row.projectId;
    if (!id || seen.has(id)) continue;
    seen.set(id, sourceLabel(row));
  }
  return [...seen]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

/** Zeilen eines Projekts; null bedeutet: alle Zeilen. */
export function rowsOfProject(
  rows: readonly SidebarRowView[],
  projectId: string | null,
): SidebarRowView[] {
  if (projectId === null) return [...rows];
  return rows.filter((row) => row.projectId === projectId);
}
