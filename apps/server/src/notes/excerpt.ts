import { NOTE_EXCERPT_MAX_LENGTH } from "@wrapt/contracts";

/** Reiner Text einer Notiz: Markdown-Zeichen fallen weg, Code zählt nicht. */
function notePlainText(content: string): string {
  return content
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*\[[ xX]\]\s*/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kurze, gut lesbare Vorschau. Mit `match` liegt das Fenster um den ersten
 * Treffer, damit Suchergebnisse den Fundort zeigen.
 */
export function createNoteExcerpt(content: string, match?: string): string {
  const plain = notePlainText(content);
  const needle = match?.trim().toLowerCase() ?? "";
  if (needle === "") return plain.slice(0, NOTE_EXCERPT_MAX_LENGTH);
  const index = plain.toLowerCase().indexOf(needle);
  if (index === -1) return plain.slice(0, NOTE_EXCERPT_MAX_LENGTH);
  const start = Math.max(0, index - 60);
  const end = Math.min(plain.length, index + needle.length + 100);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < plain.length ? "…" : "";
  return `${prefix}${plain.slice(start, end).trim()}${suffix}`.slice(0, NOTE_EXCERPT_MAX_LENGTH);
}

/** LIKE-Suchmuster: Prozent- und Unterstrichzeichen der Eingabe bleiben Text. */
export function escapeLikePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

