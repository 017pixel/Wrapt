import type { NoteSummary } from "@wrapt/contracts";
import { NOTE_SORT_ORDER_MAX, NOTE_SORT_ORDER_MIN } from "@wrapt/contracts";
import { collectDescendantIds } from "../notesTree.js";

export type NotesDropZone = "before" | "after" | "inside";

export interface NotesDropResult {
  parentId: string | null;
  sortOrder: number;
}

function siblingsOf(notes: readonly NoteSummary[], parentId: string | null): NoteSummary[] {
  return notes
    .filter((note) => note.parentId === parentId && !note.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function clampOrder(value: number): number {
  return Math.min(NOTE_SORT_ORDER_MAX - 1, Math.max(NOTE_SORT_ORDER_MIN + 1, value));
}

/**
 * Ermittelt aus einer Drop-Geste die neue Einordnung: als Kind („inside“) oder
 * als Geschwister vor/nach dem Ziel. Liefert `null`, wenn die Geste ungültig
 * ist — etwa auf sich selbst oder in einen eigenen Nachfahren.
 */
export function resolveNotesDrop(
  notes: readonly NoteSummary[],
  dragId: string,
  targetId: string,
  zone: NotesDropZone,
): NotesDropResult | null {
  if (dragId === targetId) return null;
  const target = notes.find((note) => note.id === targetId);
  if (!target) return null;
  if (collectDescendantIds(notes, dragId).includes(targetId)) return null;

  if (zone === "inside") {
    const children = siblingsOf(notes, targetId).filter((note) => note.id !== dragId);
    const last = children[children.length - 1];
    return { parentId: targetId, sortOrder: clampOrder((last?.sortOrder ?? 0) + 1) };
  }

  const parentId = target.parentId;
  const siblings = siblingsOf(notes, parentId).filter((note) => note.id !== dragId);
  const index = siblings.findIndex((note) => note.id === targetId);
  if (index === -1) return null;
  const neighbor = zone === "before" ? siblings[index - 1] : siblings[index + 1];

  if (!neighbor) {
    const delta = zone === "before" ? -0.5 : 0.5;
    return { parentId, sortOrder: clampOrder(target.sortOrder + delta) };
  }
  const low = Math.min(target.sortOrder, neighbor.sortOrder);
  const high = Math.max(target.sortOrder, neighbor.sortOrder);
  const order = low === high ? target.sortOrder + (zone === "before" ? -0.5 : 0.5) : (low + high) / 2;
  return { parentId, sortOrder: clampOrder(order) };
}

/**
 * Ziel für die sichtbare Alternative zum Ziehen (Touch): hängt die Seite als
 * letztes Kind unter `parentId`, mit `null` in die oberste Ebene. Liefert
 * `null`, wenn das Ziel ungültig ist — auf sich selbst, auf eine unbekannte
 * oder archivierte Seite oder in einen eigenen Nachfahren.
 */
export function resolveMoveToParent(
  notes: readonly NoteSummary[],
  noteId: string,
  parentId: string | null,
): NotesDropResult | null {
  if (parentId === noteId) return null;
  if (parentId !== null && !notes.some((note) => note.id === parentId && !note.archived)) return null;
  if (parentId !== null && collectDescendantIds(notes, noteId).includes(parentId)) return null;
  const children = siblingsOf(notes, parentId).filter((note) => note.id !== noteId);
  const last = children[children.length - 1];
  return { parentId, sortOrder: clampOrder((last?.sortOrder ?? 0) + 1) };
}

/** Sortiert Kinder eines Elternteils für die Anzeige (manuelle Reihenfolge). */
export function sortChildNotes(notes: readonly NoteSummary[]): NoteSummary[] {
  return [...notes].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
