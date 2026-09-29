import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { wraptQueries } from "../lib/queryOptions";
import { useMetricsHistory } from "../stores/metricsHistory";

/** Hält den serverseitig gesammelten Verlauf routeunabhängig im Dashboard-Store bereit. */
export function DashboardMetricsRuntime() {
  const metricsQuery = useQuery({
    ...wraptQueries.serverMetrics(),
    refetchInterval: false,
    refetchOnWindowFocus: true,
  });
  const metrics = metricsQuery.data;
  const mergeSamples = useMetricsHistory((state) => state.merge);

  useEffect(() => {
    if (!metrics) return;
    mergeSamples(metrics.history.map((sample) => ({
      timestamp: Date.parse(sample.timestamp),
      cpuPercent: sample.cpuPercent,
      memoryPercent: sample.memoryPercent,
    })));
  }, [metrics, mergeSamples]);

  return null;
}
