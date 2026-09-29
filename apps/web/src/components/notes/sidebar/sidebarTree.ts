import type { NoteSummary } from "@wrapt/contracts";
import { sortChildNotes } from "./treeDrop.js";

export interface SidebarTreeNode {
  note: NoteSummary;
  children: SidebarTreeNode[];
}

const MAX_DEPTH = 8;

/**
 * Baut den Seitenbaum für die Seitenleiste: Kinder unter ihrem Elternteil,
 * Waisen als Wurzel, manuelle Reihenfolge (`sortOrder`) vor Aktualität.
 * Kreise und übertiefe Verschachtelungen werden abgeschnitten.
 */
export function buildSidebarTree(notes: readonly NoteSummary[]): SidebarTreeNode[] {
  const active = notes.filter((note) => !note.archived);
  const byId = new Map(active.map((note) => [note.id, note]));
  const childrenByParent = new Map<string, NoteSummary[]>();
  const roots: NoteSummary[] = [];

  for (const note of active) {
    const parentId = note.parentId;
    if (parentId !== null && parentId !== note.id && byId.has(parentId)) {
      const siblings = childrenByParent.get(parentId) ?? [];
      siblings.push(note);
      childrenByParent.set(parentId, siblings);
    } else {
      roots.push(note);
    }
  }

  const visited = new Set<string>();
  const visit = (note: NoteSummary, level: number): SidebarTreeNode => {
    visited.add(note.id);
    const children = level >= MAX_DEPTH ? [] : sortChildNotes(childrenByParent.get(note.id) ?? []);
    return {
      note,
      children: children.filter((child) => !visited.has(child.id)).map((child) => visit(child, level + 1)),
    };
  };

  const result = sortChildNotes(roots).map((root) => visit(root, 0));
  for (const note of sortChildNotes(active)) {
    if (!visited.has(note.id)) result.push(visit(note, 0));
  }
  return result;
}
