import Fuse from "fuse.js";

/** Titel bleiben vor Inhaltstreffern; kurze Eingaben werden nur exakt gesucht. */
export function rankNoteMatches<T extends { title: string; content?: string }>(rows: T[], query: string, titleOnly: boolean): T[] {
  const normalize = (text: string) => text.toLocaleLowerCase("de").normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss");
  const q = normalize(query.trim());
  if (!q) return [];
  const indexed = rows.map((row) => ({ row, title: normalize(row.title), content: titleOnly ? "" : normalize(row.content ?? "") }));
  const titles = q.length < 4 ? [] : new Fuse(indexed, {
    keys: ["title"], threshold: .34, ignoreLocation: true, includeScore: true, ignoreFieldNorm: true, useTokenSearch: true, tokenMatch: "all",
  }).search(q);
  const titleScores = new Map(titles.map((match) => [match.item.row, match.score ?? 1]));
  const contents = titleOnly || q.length < 5 ? [] : new Fuse(indexed, {
    keys: ["content"], threshold: .24, ignoreLocation: true, includeScore: true, ignoreFieldNorm: true, useTokenSearch: true, tokenMatch: "all",
  }).search(q);
  const contentScores = new Map(contents.map((match) => [match.item.row, match.score ?? 1]));
  return indexed.map((item) => {
    const score = item.title === q ? 0 : item.title.startsWith(q) ? 1 : item.title.includes(q) ? 2
      : titleScores.has(item.row) ? 3 + titleScores.get(item.row)! : item.content.includes(q) ? 5
        : contentScores.has(item.row) ? 6 + contentScores.get(item.row)! : Infinity;
    return { row: item.row, score };
  }).filter((item) => Number.isFinite(item.score)).sort((a, b) => a.score - b.score).map((item) => item.row);
}
