import type { ProviderUsage } from "@wrapt/contracts";

export const orbitUsageRefreshIntervalMs = 30_000;

export interface OrbitUsageWindow {
  id: string;
  label: string;
  remaining: number;
  resetsAt: string | null;
}

export function orbitUsageEmptyMessage(
  provider: ProviderUsage | undefined,
  status: { isLoading: boolean; isError: boolean },
): string {
  if (status.isLoading) return "Nutzung wird geladen…";
  if (status.isError) return "Limitdaten konnten nicht geladen werden.";
  if (provider?.status === "disabled") return provider.error?.message ?? "Limitabruf ist deaktiviert.";
  if (provider?.status === "unavailable") return provider.error?.message ?? "Limitdaten sind nicht verfügbar.";
  if (!provider || provider.accounts.length === 0) return "Keine Limitdaten verfügbar.";
  return "Für diesen Account liegen keine Limitwerte vor.";
}

export function orbitProviderWindows(provider: ProviderUsage | undefined): OrbitUsageWindow[] {
  return provider?.accounts.flatMap((account) => account.windows.map((window) => ({
    id: `${account.id}-${window.id}`,
    label: `${account.email ?? account.label} · ${window.label}`,
    remaining: window.remainingPercent,
    resetsAt: window.resetsAt,
  }))) ?? [];
}

export function formatUsageReset(resetsAt: string | null): string {
  if (!resetsAt) return "Resetzeit nicht verfügbar";
  return `Reset ${new Date(resetsAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`;
}
