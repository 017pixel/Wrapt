import { useState } from "react";
import type { ServerMetricHistorySample, ServerMetrics } from "@wrapt/contracts";
import { TrendChart, type ChartSeries } from "../components/charts";
import { ActivityIcon } from "../components/icons";
import { Panel, PanelError, PanelSkeleton, queryMessage, type DashboardQuery as Query } from "./DashboardPanels";
import { formatByteRate } from "./DashboardVitals";
import { decimal } from "./dashboardMetrics";

type HistoryTab = "compute" | "network" | "disk";

const HISTORY_TABS: { id: HistoryTab; label: string }[] = [
  { id: "compute", label: "CPU / RAM" },
  { id: "network", label: "Netzwerk" },
  { id: "disk", label: "Disk-I/O" },
];

interface HistoryPoint {
  timestamp: number;
  cpuPercent: number;
  memoryPercent: number;
  received: number | null;
  transmitted: number | null;
  diskRead: number | null;
  diskWrite: number | null;
}

interface ChartBounds {
  min: number;
  max: number;
}

interface HistoryChartModel {
  series: ChartSeries[];
  points: HistoryPoint[];
  bounds?: ChartBounds;
  scaleHint?: string;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Messpunkte in Renderreihenfolge. Ungültige Zeitstempel fallen weg; die
 * Zeitachse zeigt danach ausschließlich echte Messzeitpunkte.
 */
function parseHistory(history: readonly ServerMetricHistorySample[]): HistoryPoint[] {
  return history
    .flatMap((sample): HistoryPoint[] => {
      const timestamp = Date.parse(sample.timestamp);
      if (!Number.isFinite(timestamp)) return [];
      return [{
        timestamp,
        cpuPercent: sample.cpuPercent,
        memoryPercent: sample.memoryPercent,
        received: finiteOrNull(sample.networkReceivedBytesPerSecond),
        transmitted: finiteOrNull(sample.networkTransmittedBytesPerSecond),
        diskRead: finiteOrNull(sample.diskReadBytesPerSecond),
        diskWrite: finiteOrNull(sample.diskWriteBytesPerSecond),
      }];
    })
    .sort((left, right) => left.timestamp - right.timestamp);
}

function formatRateReadout(value: number | null | undefined): string {
  const rate = formatByteRate(value);
  return rate === null ? "Nicht verfügbar" : `${rate.value} ${rate.unit}`;
}

function computeModel(points: HistoryPoint[]): HistoryChartModel {
  const last = points.at(-1);
  return {
    points,
    series: [
      {
        id: "cpu",
        label: "CPU",
        values: points.map((point) => point.cpuPercent),
        timestamps: points.map((point) => point.timestamp),
        tone: "accent",
        readout: last ? `${decimal.format(last.cpuPercent)} %` : "",
      },
      {
        id: "memory",
        label: "Arbeitsspeicher",
        values: points.map((point) => point.memoryPercent),
        timestamps: points.map((point) => point.timestamp),
        tone: "ok",
        readout: last ? `${decimal.format(last.memoryPercent)} %` : "",
      },
    ],
    bounds: { min: 0, max: 100 },
    scaleHint: "0–100 %",
  };
}

interface RateSpec {
  primary: "received" | "diskRead";
  secondary: "transmitted" | "diskWrite";
  primaryLabel: string;
  secondaryLabel: string;
}

const RATE_SPECS: Record<Exclude<HistoryTab, "compute">, RateSpec> = {
  network: {
    primary: "received",
    secondary: "transmitted",
    primaryLabel: "Empfangen",
    secondaryLabel: "Senden",
  },
  disk: {
    primary: "diskRead",
    secondary: "diskWrite",
    primaryLabel: "Lesen",
    secondaryLabel: "Schreiben",
  },
};

/**
 * Ratenreihen teilen sich die Zeitachse. Jede Richtung zeichnet nur ihre
 * eigenen Messpunkte. Ein fehlender Gegenwert lässt den echten Wert einer
 * Richtung nicht verschwinden; Nullen werden nicht erfunden.
 */
function rateModel(points: HistoryPoint[], spec: RateSpec): HistoryChartModel {
  const selected = points.filter((point) =>
    point[spec.primary] !== null || point[spec.secondary] !== null,
  );

  const series: ChartSeries[] = [];
  const primaryPoints = selected.filter((point) => point[spec.primary] !== null);
  const primaryValues = primaryPoints.map((point) => point[spec.primary] as number);
  if (primaryValues.length) {
    series.push({
      id: spec.primary,
      label: spec.primaryLabel,
      values: primaryValues,
      timestamps: primaryPoints.map((point) => point.timestamp),
      tone: "accent",
      readout: formatRateReadout(primaryValues.at(-1)),
    });
  }
  const secondaryPoints = selected.filter((point) => point[spec.secondary] !== null);
  const secondaryValues = secondaryPoints.map((point) => point[spec.secondary] as number);
  if (secondaryValues.length) {
    series.push({
      id: spec.secondary,
      label: spec.secondaryLabel,
      values: secondaryValues,
      timestamps: secondaryPoints.map((point) => point.timestamp),
      tone: "ok",
      readout: formatRateReadout(secondaryValues.at(-1)),
    });
  }

  if (!series.length) return { series, points: selected };
  const peak = Math.max(...series.flatMap((item) => [...item.values]));
  return {
    series,
    points: selected,
    bounds: { min: 0, max: peak > 0 ? peak * 1.1 : 1 },
    scaleHint: `Spitze ${formatRateReadout(peak)}`,
  };
}

function buildModel(points: HistoryPoint[], tab: HistoryTab): HistoryChartModel {
  return tab === "compute" ? computeModel(points) : rateModel(points, RATE_SPECS[tab]);
}

function axisLabel(timestamp: number, span: number): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "—";
  if (span > 6 * 3_600_000) {
    return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }
  if (span < 10 * 60_000) {
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function axisLabels(points: HistoryPoint[]): string[] {
  const start = points.at(0);
  const end = points.at(-1);
  if (!start || !end) return [];
  const span = end.timestamp - start.timestamp;
  if (span <= 0) return [axisLabel(start.timestamp, 0)];
  return [start.timestamp, start.timestamp + span / 2, end.timestamp]
    .map((timestamp) => axisLabel(timestamp, span));
}

export function DashboardHistoryPanel({
  metrics,
  stale,
}: {
  metrics: Query<ServerMetrics>;
  stale: boolean;
}) {
  const [tab, setTab] = useState<HistoryTab>("compute");
  const data = metrics.data;
  const historySource = data?.historyExtended?.length ? data.historyExtended : data?.history;
  const history = historySource ? parseHistory(historySource) : [];
  const pending = metrics.isPending && !data;
  const model = history.length ? buildModel(history, tab) : null;

  return (
    <Panel
      title="Messverlauf"
      subtitle="Vom Server gesammelte Messpunkte"
      icon={<ActivityIcon className="h-4 w-4" />}
      name="history"
      className="dash-history-panel"
      meta={data ? (
        <>
          <span className="dash-meta-time">{history.length} {history.length === 1 ? "Punkt" : "Punkte"}</span>
          {stale ? <span className="dash-head-stale">veraltet</span> : null}
        </>
      ) : null}
    >
      {metrics.isError ? (
        <PanelError
          message={queryMessage(metrics.error, "Messverlauf nicht verfügbar")}
          error={metrics.error}
          onRetry={() => void metrics.refetch()}
        />
      ) : null}

      {pending ? (
        <PanelSkeleton label="Messverlauf laden" rows={4} />
      ) : !data ? (
        <p className="dash-muted">Keine Messwerte verfügbar.</p>
      ) : !history.length ? (
        <div className="dash-history-empty" role="status">
          <span className="dash-skeleton-line" aria-hidden />
          <p>Noch keine Messpunkte im Verlauf</p>
          <small>Der Verlauf erscheint, sobald Messwerte vorliegen.</small>
        </div>
      ) : (
        <div className="dash-history-body">
          <div className="dash-history-toolbar" role="group" aria-label="Messgröße">
            {HISTORY_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="dash-history-tab"
                aria-pressed={tab === item.id}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {model && model.points.length ? (
            <TrendChart
              series={model.series}
              axisLabels={axisLabels(model.points)}
              emptyHint="Keine Werte für diesen Zeitraum"
              {...(model.bounds ? { bounds: model.bounds } : {})}
              {...(model.scaleHint ? { scaleHint: model.scaleHint } : {})}
            />
          ) : (
            <p className="dash-history-note">Keine Werte für diesen Zeitraum.</p>
          )}
        </div>
      )}
    </Panel>
  );
}
