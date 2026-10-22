import type { HermesV2CronJob, HermesV2CronRuns } from "@wrapt/contracts/hermes-v2";

/**
 * Reine Anzeigetexte der Cronfläche; kein zweites Zerlegen nativer Schedules.
 * Fehlende Werte bleiben ausdrücklich unbestimmt, kein erfundener Zustand.
 */
export const SCHEDULE_HINT = "Natives Format, z. B. every 30m, 0 9 * * * oder ein ISO-Zeitpunkt.";

export type HermesV2CronRun = HermesV2CronRuns["runs"][number];

export function repeatValue(repeat: string | number | null): string {
  if (repeat === null) return "nicht gesetzt";
  return String(repeat);
}

/** Status des Jobs als Text; null bleibt unbekannt, Farbe ist nie alleiniger Träger. */
export function stateValue(job: HermesV2CronJob): string {
  if (job.paused === null) return job.state ? `${job.state}, Pause unbekannt` : "Pause unbekannt";
  if (job.paused) return `pausiert${job.state ? `, Status ${job.state}` : ""}`;
  return `aktiv${job.state ? `, Status ${job.state}` : ""}`;
}

/** Native Ausführungsart ehrlich benennen; jedes Skript läuft in Core. */
export function executionLabel(job: HermesV2CronJob): string {
  if (job.execution.mode === "unknown") return "Ausführungsart unbekannt";
  if (job.execution.mode === "script")
    return job.execution.noAgent
      ? "Skriptausführung ohne Agent (no_agent)"
      : "Skriptausführung";
  if (job.execution.noAgent)
    return "Ausführungsart unbekannt (Widerspruch no_agent)";
  return "Agentausführung";
}

/** Status des Jobs als Text; null bleibt unbekannt, Farbe ist nie alleiniger Träger. */
export function stateLabel(job: HermesV2CronJob): string {
  return stateValue(job);
}

function tryTime(value: string): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return parsed.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return null;
  }
}

export function timeText(value: string | null): string {
  if (!value) return "unbekannt";
  return tryTime(value) ?? value;
}

export function runTimeText(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "unbekannt";
  try {
    return new Date(value).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(value);
  }
}

/** Listen- und Detailzeilen kompakt nebeneinander statt Statuswand. */
export function cronRowMeta(job: HermesV2CronJob): string {
  const parts = [
    job.schedule === null ? "Schedule unbekannt" : job.schedule,
    stateLabel(job),
    `Nächste Ausführung: ${timeText(job.nextRunAt)}`,
  ];
  return parts.join(" · ");
}
