import type { NoteSearchRange } from "@wrapt/contracts";

/**
 * Startzeitpunkt eines Suchzeitraums als ISO-Zeitstempel. „today“ beginnt um
 * Mitternacht, „week“/„month“ rechnen rückwärts ab jetzt; „any“ ergibt null.
 */
export function noteSearchRangeStart(
  range: NoteSearchRange,
  now: Date = new Date(),
): string | null {
  if (range === "any") return null;
  const start = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  start.setDate(start.getDate() - (range === "week" ? 7 : 30));
  return start.toISOString();
}
