import type { SidebarRowView } from "./sidebar-types";
import { sourceLabel } from "./sidebar-format";

/** Eine Auswahl mit sichtbarem deutschen Namen. */
export interface SidebarChoice<T extends string> {
  id: T;
  label: string;
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
