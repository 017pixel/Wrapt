export const usageRefreshIntervalMs = 30_000;

export function formatUsageReset(resetsAt: string | null): string {
  if (!resetsAt) return "Resetzeit nicht verfügbar";
  return `Reset ${new Date(resetsAt).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}`;
}
