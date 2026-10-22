// Reine Anzeigetexte der Aufgabenansicht: Status, Zeiten, Resultate. Kein Netz, kein Zustand.
import type { HermesV2WorkRoster } from "@wrapt/contracts/hermes-v2";
import type { ChatWorkAction, ChatWorkActionView, ChatWorkResult } from "./chat-work-types";

/** Anzeigename einer Zeile: belegter Text, sonst native Kennung, begrenzt. */
export function displayName(goalOrText: string | null, nativeId?: string): string {
  const value = truncate((goalOrText ?? "").trim() || nativeId || "unbenannt", 60);
  return value;
}

export function truncate(text: string, limit = 60): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

interface NamedRow { id: string; label: string }
function shortId(id: string): string { return id.length <= 12 ? id : `…${id.slice(-8)}`; }

/** Gleiche Anzeigetexte bekommen ihre native Kennung, damit Zeilenlabels eindeutig bleiben. */
export function uniqueLabels(rows: readonly NamedRow[]): Map<string, string> {
  const seen = new Map<string, number>();
  for (const row of rows) seen.set(row.label, (seen.get(row.label) ?? 0) + 1);
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.id, (seen.get(row.label) ?? 0) > 1
      ? `${row.label} (Kennung ${shortId(row.id)})` : row.label);
  }
  return map;
}

const subagentStatus: Record<string, string> = {
  queued: "in Warteschlange", running: "läuft", completed: "fertig", failed: "fehlerhaft",
  error: "Fehler", timeout: "Zeitüberschreitung", interrupted: "unterbrochen",
};
export const subagentStatusLabel = (status: string | null) =>
  status === null ? "unbekannt" : subagentStatus[status] ?? "unbekannt";

const taskKind: Record<string, string> = { background: "Hintergrund", btw: "Zwischenauftrag" };
export const taskKindLabel = (kind: string) => taskKind[kind] ?? kind;

const steerStatus: Record<string, string> = {
  queued: "Die Steuerung ist eingereiht.", redirected: "Der laufende Turn wurde umgelenkt.",
  rejected: "Die Steuerung wurde abgelehnt.",
};
const queueStatus: Record<string, string> = {
  streaming: "Die Nachricht startet sofort einen Turn.", queued: "Die Nachricht ist eingereiht.",
  steered: "Der laufende Turn wurde umgelenkt.", redirected: "Die Nachricht trat als Steuerung an.",
};
const processStatus: Record<string, string> = {
  killed: "Der Prozess wurde beendet.", already_exited: "Der Prozess war bereits beendet.",
  not_found: "Der Prozess ist nicht mehr belegt.", error: "Der Prozess konnte nicht beendet werden.",
};

/** Bekannte native Prozesswerte verständlich oder einen rudernden Zustand dazu. */
const processStateLabels: Record<string, string> = {
  running: "läuft", exited: "beendet", killed: "beendet", interrupted: "unterbrochen",
  failed: "fehlerhaft", error: "Fehler", timeout: "Zeitüberschreitung",
};
/** Zustandsklasse nur für belegte Werte; unbekannte werden nie zu fertig/laufend geraten. */
export function processStateView(
  status: string | null,
  exitCode: number | null,
): { label: string; state: string } {
  if (status !== null) {
    const label = processStateLabels[status];
    if (label) return { label, state: mapProcessState(status) };
    // Unbekannter strukturierter Wert: ehrlich anzeigen, nicht deuten.
    return { label: truncate(status, 30), state: "unknown" };
  }
  if (exitCode !== null) return { label: "beendet", state: "done" };
  return { label: "unbekannt", state: "unknown" };
}

function mapProcessState(status: string): string {
  switch (status) {
    case "running": return "running";
    case "exited":
    case "killed": return "done";
    case "interrupted": return "interrupted";
    case "failed": return "failed";
    case "error": return "error";
    case "timeout": return "timeout";
    default: return "unknown";
  }
}

export function resultLabel(result: ChatWorkResult): string {
  switch (result.kind) {
    case "subagent.interrupt":
      return result.found ? "Unteraufgabe wurde unterbrochen." : "Unteraufgabe ist nicht mehr belegt; nichts unternommen.";
    case "subagent.tail":
      return result.available
        ? `Ausgabe gelesen; Karte im Eintrag.${result.truncated ? " Die Ausgabe ist gekürzt." : ""}`
        : "Es liegt keine Ausgabe bereit.";
    case "process.kill":
      return `${processStatus[result.status] ?? "Unbekanntes Resultat."}${result.error ? ` (${result.error})` : ""}`;
    case "background":
    case "btw":
      return `${taskKindLabel(result.kind)} gestartet (Kennung ${truncate(result.taskId, 24)}).`;
    case "steer":
      return steerStatus[result.status] ?? "Unbekanntes Steuerresultat.";
    case "queue":
      return queueStatus[result.status] ?? "Unbekanntes Einreiheresultat.";
  }
}

const actionName: Record<ChatWorkAction, string> = {
  "subagent.interrupt": "Unteraufgabe unterbrechen", "subagent.tail": "Unteraufgabe-Ausgabe lesen",
  "process.kill": "Prozess beenden", background: "Hintergrundaufgabe starten",
  btw: "Zwischenauftrag starten", steer: "Steuer senden", queue: "Einreihen",
};

const actionStatus: Record<ChatWorkActionView["status"], string> = {
  pending: "läuft", confirmed: "bestätigt", unknown: "Ausgang unklar", not_sent: "nicht gesendet",
};

export function actionRows(entry: ChatWorkActionView): string[] {
  const rows = [`${actionName[entry.action]}: ${actionStatus[entry.status]}`];
  if (entry.result) rows.push(resultLabel(entry.result));
  if (entry.error) rows.push(entry.error.message);
  return rows;
}

const timeFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const formatStamp = (ms: number | null) => (ms === null ? null : timeFormat.format(new Date(ms)));

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 120) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 120 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function formatUptime(seconds: number | null): string | null {
  if (seconds === null) return null;
  return seconds < 120 ? `${seconds} s` : formatDuration(seconds * 1000);
}

/** Teilabdeckung sichtbar halten: nur dieDomänen nennen, die wirklich partiell sind. */
export function coverageNote(coverage: HermesV2WorkRoster["coverage"] | null): string {
  if (coverage === null) return "";
  const parts: string[] = [];
  if (coverage.delegations === "recent-failures-partial") parts.push("Fehlerdelegationen teilweise");
  if (coverage.tasks === "observed-partial") parts.push("Nebenaufgaben teilweise");
  if (coverage.truncated) parts.push("gekürzt");
  return parts.length ? `Teilabdeckung: ${parts.join(", ")}.` : "";
}
