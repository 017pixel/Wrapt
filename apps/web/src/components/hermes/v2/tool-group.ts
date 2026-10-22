import type { ChatMessageView, ChatToolView } from "./chat-types";

/** Ein Werkzeugaufruf mit dem Zeitbeleg seiner Herkunftszeile. */
export interface ToolEntry {
  tool: ChatToolView;
  timestamp: number | null;
}

/**
 * Der Verlauf als Blöcke: Textzeilen und zusammengefasste Werkzeuggruppen.
 * `durationMs` nennt die Zeit bis zur Antwort: die Spanne von der Nachricht
 * vor dem Block bis zur Nachricht danach. Ohne belegte Zeitstempel bleibt sie
 * unbekannt (null) - der Block erfindet dann nichts.
 */
export type ToolBlock =
  | { kind: "message"; message: ChatMessageView }
  | {
      kind: "tools";
      id: string;
      entries: ToolEntry[];
      reasoning: readonly string[];
      durationMs: number | null;
    };

const SUMMARY_LIMIT = 120;

/** Bekannte Argumentnamen; ihr Wert ist der eigentliche Aufruf. */
const ARGUMENT_KEYS = [
  "command",
  "cmd",
  "script",
  "url",
  "path",
  "file",
  "query",
  "prompt",
  "text",
];

/** Reine Werkzeugzeilen tragen weder Text noch eigenen Beleg. */
export function isToolOnly(message: ChatMessageView): boolean {
  return (
    message.tools.length > 0 &&
    message.text === "" &&
    !message.reasoning &&
    message.error === null
  );
}

/** Eine Zeile, die nur Gedanken traegt und sonst nichts sichtbar macht. */
export function isThinkingOnly(message: ChatMessageView): boolean {
  return (
    message.tools.length === 0 &&
    message.text === "" &&
    typeof message.reasoning === "string" &&
    message.reasoning !== "" &&
    message.error === null
  );
}

/**
 * Zeit bis zur Antwort. Beginnt die Arbeit mit dem ersten Werkzeugaufruf,
 * weil die Nachricht davor nicht im geladenen Verlauf liegt, gilt dieser als
 * Beginn. Ohne belegten Zeitstempel bleibt die Dauer unbekannt.
 */
function timeToAnswer(
  before: ChatMessageView | undefined,
  firstEntry: ToolEntry | undefined,
  after: ChatMessageView | undefined,
): number | null {
  const start = before?.timestamp ?? firstEntry?.timestamp ?? null;
  const end = after?.timestamp ?? null;
  if (start === null || end === null) return null;
  return end < start ? null : end - start;
}

/**
 * Aufeinanderfolgende Werkzeugzeilen werden zu einer Gruppe zusammengefasst.
 * Eine Textzeile trennt Gruppen; trägt sie selbst Werkzeuge, bekommen diese
 * eine eigene Gruppe direkt darunter.
 * Gedanken ohne sichtbaren Text wandern in die folgende Gruppe: so stehen sie
 * wie bei T3 Code in derselben Liste wie die Werkzeugaufrufe.
 * Jede Gruppe trägt die Zeit bis zur Antwort: von der Nachricht vor der
 * Gruppe bis zur Nachricht danach.
 */
export function groupToolBlocks(
  messages: readonly ChatMessageView[],
): ToolBlock[] {
  const blocks: ToolBlock[] = [];
  let pending: ToolEntry[] = [];
  let pendingReasoning: string[] = [];
  // Index der ersten Nachricht der laufenden Gruppe. Davor beginnt die Arbeit.
  let pendingStart = -1;
  // Index der letzten sichtbaren Nachricht: sie markiert den Beginn der Arbeit.
  let lastVisible = -1;
  const flush = (afterIndex: number) => {
    if (pending.length === 0 && pendingReasoning.length === 0) {
      pendingStart = -1;
      return;
    }
    blocks.push({
      kind: "tools",
      id: messages[pendingStart]!.id,
      entries: pending,
      reasoning: pendingReasoning,
      durationMs: timeToAnswer(
        messages[pendingStart - 1],
        pending[0],
        messages[afterIndex],
      ),
    });
    pending = [];
    pendingReasoning = [];
    pendingStart = -1;
  };
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (isToolOnly(message)) {
      if (pendingStart < 0) pendingStart = index;
      for (const tool of message.tools) {
        pending.push({ tool, timestamp: message.timestamp });
      }
      continue;
    }
    if (isThinkingOnly(message)) {
      // Die Gedanken gehören zur Arbeit, die danach folgt. Aufeinanderfolgende
      // Gedankblöcke bleiben alle erhalten.
      if (pendingStart < 0) pendingStart = index;
      pendingReasoning.push(message.reasoning ?? "");
      continue;
    }
    flush(index);
    blocks.push({ kind: "message", message });
    if (message.tools.length > 0) {
      // Die Antwort traegt die Werkzeuge selbst: die Arbeit endet mit ihr.
      // Der Beginn ist die letzte sichtbare Nachricht davor.
      blocks.push({
        kind: "tools",
        id: message.id,
        entries: message.tools.map((tool) => ({
          tool,
          timestamp: message.timestamp,
        })),
        reasoning: [],
        durationMs: timeToAnswer(messages[lastVisible], undefined, message),
      });
    }
    lastVisible = index;
  }
  flush(messages.length);
  return blocks;
}

/**
 * Der laufende Aufruf wandert in die letzte Gruppe; ohne Gruppe bleibt er
 * eine eigene Vorschau. So entsteht die Meldung zum laufenden Werkzeug
 * genau einmal.
 */
export function withRunningTool(
  blocks: readonly ToolBlock[],
  name: string | null,
): ToolBlock[] {
  if (!name) return [...blocks];
  const entry: ToolEntry = {
    tool: {
      id: `generating:${name}`,
      toolId: `generating:${name}`,
      turnId: "",
      name,
      status: "running",
      outcome: "unknown",
      input: null,
      output: null,
      durationMs: null,
    },
    timestamp: null,
  };
  const last = blocks.at(-1);
  if (last?.kind === "tools") {
    return [
      ...blocks.slice(0, -1),
      {
        kind: "tools",
        id: last.id,
        entries: [...last.entries, entry],
        reasoning: last.reasoning,
        // Die Arbeit läuft noch: bis zur Antwort fehlt ein Zeitbeleg.
        durationMs: null,
      },
    ];
  }
  return [
    ...blocks,
    { kind: "tools", id: entry.tool.id, entries: [entry], reasoning: [], durationMs: null },
  ];
}

/** Status und Erfolg bleiben getrennt: „beendet" ist nicht „erfolgreich". */
export function toolStatusLabel(tool: ChatToolView): string {
  if (tool.status === "running") return "läuft";
  if (tool.status === "complete") {
    if (tool.outcome === "error") return "fehlgeschlagen";
    if (tool.outcome === "success") return "fertig";
    return "beendet";
  }
  return "unbekannt";
}

/**
 * Wert eines bekannten Arguments aus der JSON-Eingabe. Der Wert stammt
 * unverändert aus der Eingabe; ohne Treffer bleibt es bei null.
 */
function argumentValue(input: string): string | null {
  if (!input.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  for (const key of ARGUMENT_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

/** Kurze, ehrliche Zusammenfassung des Aufrufs aus der belegten Eingabe. */
export function summarizeToolInput(input: string | null): string | null {
  if (input === null) return null;
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const flat = (argumentValue(trimmed) ?? trimmed).replace(/\s+/g, " ").trim();
  if (flat === "") return null;
  return flat.length > SUMMARY_LIMIT
    ? `${flat.slice(0, SUMMARY_LIMIT)}…`
    : flat;
}

/** Ein Formatter je Modul: das Anlegen ist teurer als das Formatieren. */
const clockFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

/** Uhrzeit der Aktion im deutschen 24-Stunden-Format. */
export function formatClock(timestamp: number | null): string | null {
  if (timestamp === null) return null;
  return clockFormatter.format(new Date(timestamp));
}

/** Kurze Dauern in Sekunden, ab einer Minute in Minuten und Sekunden. */
export function formatWorkDuration(ms: number): string {
  if (ms < 60_000) {
    return `${(ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s`;
  }
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)} Min. ${seconds % 60} s`;
}

/**
 * Der Gruppenkopf nennt zuerst die Zeit bis zur Antwort, wenn sie belegt ist.
 * Sonst nennt er die Summe der Dauern der Aufrufe, aber nur, wenn jeder
 * Aufruf eine belegte Dauer trägt und keiner mehr läuft. Ohne jeden Beleg
 * nennt er die Zahl der Aufrufe, damit die Aussage belegt bleibt.
 */
export function groupDurationLabel(
  entries: readonly ToolEntry[],
  durationMs: number | null = null,
): string {
  if (durationMs !== null) {
    return `Gearbeitet für ${formatWorkDuration(durationMs)}`;
  }
  const belegt =
    entries.length > 0 &&
    entries.every(
      (entry) =>
        entry.tool.status === "complete" && entry.tool.durationMs !== null,
    );
  if (!belegt) {
    return entries.length === 1
      ? "Gearbeitet"
      : `Gearbeitet · ${entries.length} Aufrufe`;
  }
  const ms = entries.reduce(
    (sum, entry) => sum + (entry.tool.durationMs ?? 0),
    0,
  );
  return `Gearbeitet für ${formatWorkDuration(ms)}`;
}
