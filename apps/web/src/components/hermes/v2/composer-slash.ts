// Reine Palette-Suchlogik: Fuzzy über den dynamischen Katalog, keine Netzaufrufe.
import type { HermesV2Command } from "@wrapt/contracts/hermes-v2";

export interface SlashEntry {
  command: HermesV2Command;
  /** Trefferqualität: 0 = exakt, dann Teilstring, dann Lückenfolge. */
  score: number;
  /** Kanonischer sichtbarer Schlüssel mit Slash (Aliase sind Suchbegriffe derselben Zeile). */
  displayKey: string;
}

export const SLASH_LIMIT = 60;

/** Ein Draft beginnt als Slash-Draft, wenn sein erstes Zeichen "/" ist. */
export function splitSlashDraft(text: string): {
  startsSlash: boolean;
  rest: string;
} {
  if (text.length === 0 || text[0] !== "/")
    return { startsSlash: false, rest: "" };
  return { startsSlash: true, rest: text.slice(1) };
}

/** Das erste Wort wiederum: Command-Hinweis und Argumentrest. */
export function restHead(rest: string): { head: string; argument: string } {
  const index = rest.search(/\s/);
  if (index < 0) return { head: rest, argument: "" };
  return {
    head: rest.slice(0, index),
    argument: rest.trim().slice(index).trim(),
  };
}

function subsequenceScore(source: string, query: string): number | null {
  let from = 0;
  let gaps = 0;
  for (const character of query) {
    const at = source.indexOf(character, from);
    if (at < 0) return null;
    gaps += at - from;
    from = at + 1;
  }
  return gaps;
}

const commandHead = (command: HermesV2Command): string =>
  command.key.replace(/^\//, "").toLocaleLowerCase();

export function filterSlashCommands(
  commands: readonly HermesV2Command[],
  query: string,
): SlashEntry[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q) {
    // Kataloge sind dynamisch und können groß sein: begrenzt darstellen,
    // native Befehle zuerst, dann Skills, dann Classic-Commands.
    return commands.slice(0, SLASH_LIMIT).map((command) => ({
      command,
      score: tagRank(command),
      displayKey: command.key,
    }));
  }
  const entries: SlashEntry[] = [];
  for (const command of commands) {
    const head = commandHead(command);
    const aliases = (command.aliases ?? []).map((alias) =>
      alias.replace(/^\//, "").toLocaleLowerCase(),
    );
    let best: number | null =
      head === q ? 0 : head.startsWith(q) ? 1 : subsequenceScore(head, q);
    for (const alias of aliases) {
      const aliasScore =
        alias === q ? 0 : alias.startsWith(q) ? 1 : subsequenceScore(alias, q);
      if (aliasScore !== null)
        best = best === null ? aliasScore : Math.min(best, aliasScore);
    }
    // Label ist Suchbegriff, aber nie schlagkräftiger als der kanonische Treffer.
    const label = labelScore(command.label, q);
    if (label !== null)
      best = best === null ? 2 + label : Math.min(best, 2 + label);
    if (best !== null)
      entries.push({ command, score: best, displayKey: command.key });
  }
  entries.sort(
    (a, b) => a.score - b.score || a.displayKey.localeCompare(b.displayKey),
  );
  return entries.slice(0, SLASH_LIMIT);
}

function labelScore(label: string, q: string): number | null {
  const lower = label.toLocaleLowerCase();
  if (lower === q) return 0;
  if (lower.startsWith(q)) return 1;
  return subsequenceScore(lower, q);
}

/** Sortierreihenfolge des ungefilterten Katalogs: native, Skills, Classic. */
function tagRank(command: HermesV2Command): number {
  return command.kind === "unsupported" ? 2 : command.kind === "skill" ? 1 : 0;
}

/** Argumenthinweis samt Unterfeldern aus exportierten Metadaten, begrenzt. */
export function slashHint(command: HermesV2Command): string | null {
  const parts: string[] = [];
  if (command.argumentHint) parts.push(command.argumentHint);
  const subcommands = command.subcommands ?? [];
  if (subcommands.length > 0) {
    parts.push(
      `Unterfelder: ${subcommands.slice(0, 5).join(", ")}${subcommands.length > 5 ? " …" : ""}`,
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Beschreibung begrenzt darstellen; lange Katalogtexte bleiben erträglich. */
export function slashDescription(
  command: HermesV2Command,
  maxLength = 110,
): string {
  return command.description.length <= maxLength
    ? command.description
    : `${command.description.slice(0, maxLength - 1)}…`;
}
