import type { NoteSummary } from "@wrapt/contracts";

/** Alle Nachfahren-IDs einer Notiz (für Papierkorb-Hinweise und Auswahl). */
export function collectDescendantIds(notes: readonly NoteSummary[], noteId: string): string[] {
  const result: string[] = [];
  const queue = [noteId];
  const seen = new Set<string>([noteId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const note of notes) {
      if (note.parentId === current && !seen.has(note.id)) {
        seen.add(note.id);
        result.push(note.id);
        queue.push(note.id);
      }
    }
  }
  return result;
}
