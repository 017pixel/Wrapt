import type { NoteSearchRange, NoteSummary } from "@wrapt/contracts";
import { collectDescendantIds } from "../notesTree.js";

export interface NotesPaletteFilters {
  titleOnly: boolean;
  scopeId: string | null;
  createdWithin: NoteSearchRange;
  updatedWithin: NoteSearchRange;
}

export const defaultPaletteFilters: NotesPaletteFilters = {
  titleOnly: false,
  scopeId: null,
  createdWithin: "any",
  updatedWithin: "any",
};

export const notesRangeLabels: Record<NoteSearchRange, string> = {
  any: "Beliebig",
  today: "Heute",
  week: "Letzte 7 Tage",
  month: "Letzte 30 Tage",
};

export const notesRangeOptions: NoteSearchRange[] = ["any", "today", "week", "month"];

/** Zeitpunkt, ab dem ein Zeitraum gilt; „any“ und „today“ rechnet die UI lokal. */
export function rangeStartTime(range: NoteSearchRange, now: Date = new Date()): number | null {
  if (range === "any") return null;
  const start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  start.setDate(start.getDate() - (range === "week" ? 7 : 30));
  return start.getTime();
}

/**
 * Filtert clientseitig, wenn ohne Suchbegriff die zuletzt geänderten Seiten
 * gezeigt werden. Der Server filtert dieselben Kriterien für echte Treffer.
 */
export function noteMatchesFilters(
  note: NoteSummary,
  filters: NotesPaletteFilters,
  allNotes: readonly NoteSummary[],
  now: Date = new Date(),
): boolean {
  if (note.archived) return false;
  if (filters.scopeId !== null) {
    const inScope =
      note.id === filters.scopeId || collectDescendantIds(allNotes, filters.scopeId).includes(note.id);
    if (!inScope) return false;
  }
  const createdAfter = rangeStartTime(filters.createdWithin, now);
  const updatedAfter = rangeStartTime(filters.updatedWithin, now);
  if (createdAfter !== null && new Date(note.createdAt).getTime() < createdAfter) return false;
  if (updatedAfter !== null && new Date(note.updatedAt).getTime() < updatedAfter) return false;
  return true;
}
