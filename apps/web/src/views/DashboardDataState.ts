import type { DashboardQuery } from "./DashboardPanels";

/**
 * Zeigt nur dann gespeicherte Werte, wenn eine Aktualisierung ausgeblieben ist.
 * Die Prüfung nutzt die clientseitige Erfolgszeit. Serverzeitstempel wären bei
 * abweichenden Geräteuhren ein falscher Maßstab.
 */
export function isDashboardDataStale<T>(
  query: DashboardQuery<T>,
  refreshMilliseconds: number | undefined,
): boolean {
  if (!query.data) return false;
  if (query.isError) return true;
  if (!refreshMilliseconds) return false;

  return Date.now() - query.dataUpdatedAt > refreshMilliseconds * 2;
}
