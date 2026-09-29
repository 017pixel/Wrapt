import type { NoteSummary } from "@wrapt/contracts";

export type NotesDateGroupId = "today" | "yesterday" | "lastWeek" | "older";

export interface NotesDateGroup {
  id: NotesDateGroupId;
  label: string;
  notes: NoteSummary[];
}

const GROUP_LABELS: Record<NotesDateGroupId, string> = {
  today: "Heute",
  yesterday: "Gestern",
  lastWeek: "Vergangene Woche",
  older: "Älter",
};

const GROUP_ORDER: NotesDateGroupId[] = ["today", "yesterday", "lastWeek", "older"];

function startOfDay(reference: Date): number {
  const date = new Date(reference);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Gruppiert Suchtreffer nach dem letzten Änderungsdatum — wie in Notion:
 * Heute, Gestern, Vergangene Woche, Älter. Leere Gruppen fallen weg.
 */
export function groupNotesByDate(
  notes: readonly NoteSummary[],
  now: Date = new Date(),
): NotesDateGroup[] {
  const todayStart = startOfDay(now);
  const yesterdayStart = startOfDay(new Date(todayStart - 1));
  const weekStart = startOfDay(new Date(todayStart - 7 * 24 * 60 * 60 * 1000));

  const buckets = new Map<NotesDateGroupId, NoteSummary[]>();
  for (const note of notes) {
    const time = new Date(note.updatedAt).getTime();
    const id: NotesDateGroupId =
      time >= todayStart ? "today" : time >= yesterdayStart ? "yesterday" : time >= weekStart ? "lastWeek" : "older";
    const bucket = buckets.get(id) ?? [];
    bucket.push(note);
    buckets.set(id, bucket);
  }

  return GROUP_ORDER.flatMap((id) => {
    const bucket = buckets.get(id);
    if (!bucket || bucket.length === 0) return [];
    const sorted = [...bucket].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return [{ id, label: GROUP_LABELS[id], notes: sorted }];
  });
}
