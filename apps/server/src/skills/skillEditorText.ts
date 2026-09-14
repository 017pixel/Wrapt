const NESTED_KEY_PATTERN = /^[A-Za-z0-9_-]+\s*:/;

/**
 * Liest den Frontmatter-Kopf einer `SKILL.md`. Bewusst ein schlanker Zeilenparser
 * statt einer YAML-Abhängigkeit: gebraucht werden nur die flachen Schlüssel
 * `name`, `description` und `license` aus dem Block zwischen den `---`-Markern.
 */
export function parseSkillFrontmatter(content: string): Record<string, string> {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return {};
  const result: Record<string, string> = {};
  let continuedKey: string | null = null;
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") break;
    if (/^\s/.test(line)) {
      // Eingerückte Zeilen setzen einen leer begonnenen Wert fort (YAML-Blockschreibweise).
      // Verschachtelte Schlüssel wie unter `metadata:` bleiben außen vor.
      const text = line.trim();
      if (continuedKey && text && !NESTED_KEY_PATTERN.test(text)) {
        result[continuedKey] = `${result[continuedKey] ?? ""} ${text}`.trim();
      }
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) { continuedKey = null; continue; }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    continuedKey = value ? null : key;
    if (key && value) result[key] = value;
  }
  return result;
}

/** Ersetzt die `name:`-Zeile im Frontmatter — der Name muss dem Ordner entsprechen. */
export function withFrontmatterName(content: string, name: string): string {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return content;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index]?.trim() === "---") break;
    if (/^name\s*:/.test(lines[index] ?? "")) {
      lines[index] = `name: ${name}`;
      return lines.join("\n");
    }
  }
  return content;
}

function escapeTableCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

/** Hängt eine Zeile an die letzte Markdown-Tabelle der README an. */
export function readmeWithRow(content: string, name: string, description: string): string | null {
  const lines = content.split("\n");
  let lastTableLine = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trimStart().startsWith("|")) lastTableLine = index;
  }
  if (lastTableLine < 0) return null;
  lines.splice(lastTableLine + 1, 0, `| ${name} | ${escapeTableCell(description)} |`);
  return lines.join("\n");
}

function tableRowPattern(name: string): RegExp {
  return new RegExp(`^\\s*\\|\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\|`);
}

export function hasReadmeRow(content: string, name: string): boolean {
  return content.split("\n").some((line) => tableRowPattern(name).test(line));
}

export function readmeWithRenamedRow(content: string, name: string, newName: string): string | null {
  const lines = content.split("\n");
  const pattern = tableRowPattern(name);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) return null;
  lines[index] = lines[index]!.replace(name, newName);
  return lines.join("\n");
}

export function readmeWithoutRow(content: string, name: string): string | null {
  const lines = content.split("\n");
  const pattern = tableRowPattern(name);
  const index = lines.findIndex((line) => pattern.test(line));
  if (index < 0) return null;
  lines.splice(index, 1);
  return lines.join("\n");
}
