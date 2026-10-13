import type { ServerMetrics, ServiceMode } from "@wrapt/contracts";
export const integer = new Intl.NumberFormat("de-DE");
export const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function serverModeLabel(mode: ServiceMode): string {
  return mode === "embedded" ? "eingebettet" : mode === "external" ? "extern" : "hybrid";
}

export function formatDateTime(value: string | null): string {
  if (!value) return "nicht verfügbar";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "nicht verfügbar";
}

export function percentOf(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

/**
 * Linux meldet auch Pseudo-Dateisysteme wie `/boot/efi/efivars` mit wenigen
 * Kilobyte. Die verfälschen jede „vollstes Laufwerk“-Aussage, deshalb bleiben
 * nur Laufwerke ab einem Gigabyte übrig.
 */
export function realDisks(disks: ServerMetrics["disks"]): ServerMetrics["disks"] {
  const relevant = disks.filter((disk) => disk.totalBytes >= 1024 ** 3);
  return relevant.length ? relevant : disks;
}

