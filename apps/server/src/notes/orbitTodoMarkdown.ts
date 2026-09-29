interface LegacyTodoItem {
  id?: unknown;
  text?: unknown;
  done?: unknown;
  [key: string]: unknown;
}

function record(value: unknown): LegacyTodoItem | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as LegacyTodoItem
    : null;
}

function printable(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function titleCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function metadataLabel(value: string): string {
  const labels: Record<string, string> = {
    id: "ID",
    date: "Datum",
    dueDate: "Fällig am",
    dueAt: "Fällig am",
    description: "Beschreibung",
    notes: "Notizen",
    priority: "Priorität",
    status: "Status",
    createdAt: "Erstellt",
    updatedAt: "Geändert",
  };
  return labels[value] ?? titleCase(value);
}

function itemLines(item: LegacyTodoItem, index: number): string[] {
  const text = printable(item.text) ?? `Aufgabe ${index + 1}`;
  const done = item.done === true || item.completed === true || item.status === "done" || item.status === "completed";
  const lines = [`- [${done ? "x" : " "}] ${text.replace(/[\r\n]+/g, " ")}`];
  const metadata = Object.entries(item).filter(([key, value]) => key !== "text" && key !== "done" && value !== undefined);
  for (const [key, value] of metadata) {
    const display = printable(value);
    if (display !== null) lines.push(`  - ${metadataLabel(key)}: ${display.replace(/[\r\n]+/g, " ")}`);
  }
  return lines;
}

/** Wandelt das versionierte Orbit-To-do-Format in Notes-Task-Blöcke um. */
export function orbitTodoMarkdown(content: string): string {
  if (content.trim() === "") return "";

  try {
    const parsed: unknown = JSON.parse(content);
    const source = record(parsed);
    if (source?.version === 1 && Array.isArray(source.items)) {
      return source.items.flatMap((item, index) => {
        const task = record(item);
        if (task) return itemLines(task, index);
        const text = printable(item);
        return text === null ? [] : [`- [ ] ${text.replace(/[\r\n]+/g, " ")}`];
      }).join("\n");
    }
  } catch {
    // Unversionierter Alttext wird weiter unten übernommen.
  }

  if (/^\s*[-*+]\s+\[[ xX]\]\s+/m.test(content)) return content;
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- [ ] ${line.replace(/^[-*+]\s+/, "")}`)
    .join("\n");
}
