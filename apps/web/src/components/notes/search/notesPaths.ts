import type { NoteSummary } from "@wrapt/contracts";

/**
 * Pfad einer Seite als „Eltern / Kind“-Kette; die Seite selbst zählt nicht mit.
 * Kreise werden abgeschnitten, damit die Berechnung nie hängen bleibt.
 */
export function buildNotePathMap(notes: readonly NoteSummary[]): Map<string, string> {
  const byId = new Map(notes.map((note) => [note.id, note]));
  const paths = new Map<string, string>();

  const pathFor = (noteId: string): string => {
    const cached = paths.get(noteId);
    if (cached !== undefined) return cached;
    const chain: string[] = [];
    const seen = new Set<string>([noteId]);
    let current = byId.get(noteId);
    while (current?.parentId != null && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      chain.unshift(parent.title);
      current = parent;
    }
    const value = chain.join(" / ");
    paths.set(noteId, value);
    return value;
  };

  for (const note of notes) pathFor(note.id);
  return paths;
}
