import type { ServerMetrics, ServerSummary } from "@wrapt/contracts";
import { decimal } from "./dashboardMetrics";

export function formatServerUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "nicht verfügbar";

  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days} ${days === 1 ? "Tag" : "Tage"}, ${hours} ${hours === 1 ? "Stunde" : "Stunden"}`;
  if (hours > 0) return `${hours} ${hours === 1 ? "Stunde" : "Stunden"}, ${minutes} Min.`;
  return `${minutes} Min.`;
}

export function formatLoadAverage(values: ServerMetrics["loadAverage"]): string {
  return values.map((value) => decimal.format(value)).join(" / ");
}

export function formatTailscaleState(state: ServerSummary["tailscale"]["state"]): string {
  if (state === "connected") return "Verbunden";
  if (state === "disconnected") return "Getrennt";
  return "Unbekannt";
}
