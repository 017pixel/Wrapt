/**
 * Parser für die CHANGELOG.md. Er liest nur die Abschnitte mit Versionskopf
 * (`## [2.4.0] - 2026-10-13`), deren Unterabschnitte (`### Erstellt`) und die
 * Stichpunkte darunter. Alles davor und danach — etwa die Archivliste unter
 * „Ältere Versionen" — wird ignoriert.
 */

export interface ChangelogText {
  readonly kind: "text" | "code" | "strong";
  readonly text: string;
}

export interface ChangelogSection {
  readonly title: string;
  readonly items: readonly string[];
}

export interface ChangelogEntry {
  readonly version: string;
  readonly date: string | null;
  readonly sections: readonly ChangelogSection[];
}

/** So viele Versionen zeigt die Hover-Card; der Rest bleibt im Repository. */
export const CHANGELOG_ENTRY_LIMIT = 5;
const ENTRY = /^##\s+\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const SECTION = /^###\s+(.+?)\s*$/;
const ITEM = /^[-*]\s+(.+?)\s*$/;

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: { version: string; date: string | null; sections: ChangelogSection[] } | null = null;
  let section: { title: string; items: string[] } | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    const entry = ENTRY.exec(line);
    if (entry) {
      // Jeder weitere `##`-Kopf beendet den aktuellen Eintrag, auch wenn er
      // keine Version ist — sonst würden Archiv-Stichpunkte hinten ankleben.
      section = null;
      current = { version: entry[1]!.trim(), date: entry[2] ?? null, sections: [] };
      entries.push(current);
      continue;
    }
    if (line.startsWith("## ")) {
      current = null;
      section = null;
      continue;
    }
    if (current === null) continue;

    const heading = SECTION.exec(line);
    if (heading) {
      section = { title: heading[1]!.trim(), items: [] };
      current.sections.push(section);
      continue;
    }
    const item = ITEM.exec(line);
    if (!item) continue;
    // Stichpunkte ohne vorangegangenen Unterabschnitt landen in einem
    // unbenannten Abschnitt und bleiben so sichtbar.
    section ??= { title: "", items: [] };
    if (current.sections.at(-1) !== section) current.sections.push(section);
    section.items.push(item[1]!);
  }

  return entries;
}

const INLINE_TOKEN = /`([^`]+)`|\*\*([^*]+)\*\*/g;

/** Zerlegt Backtick-Code und fette Stellen eines Stichpunkts in Textstücke. */
export function parseChangelogInline(source: string): ChangelogText[] {
  const parts: ChangelogText[] = [];
  let lastIndex = 0;
  for (const match of source.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ kind: "text", text: source.slice(lastIndex, index) });
    parts.push(match[1] !== undefined
      ? { kind: "code", text: match[1] }
      : { kind: "strong", text: match[2] ?? "" });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < source.length) parts.push({ kind: "text", text: source.slice(lastIndex) });
  return parts;
}

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric" });

export function formatChangelogDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : dateFormat.format(parsed);
}

/** Punktweiser Versionsvergleich; unbekannte Teile zählen als gleich. */
function compareVersions(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const value = Number.parseInt(left[index] ?? "0", 10);
    const other = Number.parseInt(right[index] ?? "0", 10);
    if (Number.isNaN(value) || Number.isNaN(other)) return 0;
    if (value !== other) return value - other;
  }
  return 0;
}

/**
 * Die Einträge bis zur laufenden Version. Frontend und Backend werden getrennt
 * neu gebaut; ohne den Schnitt würde die Card direkt nach einem Versionssprung
 * Versionen zeigen, die der laufende Dienst noch gar nicht kennt.
 */
export function changelogEntriesForVersion(
  entries: readonly ChangelogEntry[],
  version: string | null | undefined,
): ChangelogEntry[] {
  const relevant = version
    ? entries.filter((entry) => compareVersions(entry.version, version) <= 0)
    : entries;
  return relevant.slice(0, CHANGELOG_ENTRY_LIMIT);
}
