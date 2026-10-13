import { useMemo, type ReactNode } from "react";
import type { ServerSummary, ServerMetrics, ReadinessResponse, OperationalMetricsResponse } from "@wrapt/contracts";
import { ServerIcon } from "../components/icons";
import { Meter, Sparkline, TrendChart, loadTone } from "../components/charts";
import { formatBytes, formatRelativeTime } from "../lib/format";
import { computeTrend, useMetricsHistory } from "../stores/metricsHistory";
import { Panel, PanelError, queryMessage, type DashboardQuery as Query } from "./DashboardPanels";
import { decimal, percentOf, realDisks } from "./dashboardMetrics";
import { DashboardStorageList } from "./DashboardStorageList";
import "./dashboard-loading.css";

interface SystemState {
  tone: "ok" | "warn" | "bad";
  label: string;
  detail: string;
}

export function deriveSystemState(
  summary: ServerSummary | undefined,
  readiness: ReadinessResponse | undefined,
  readinessFailed: boolean,
  metrics: ServerMetrics | undefined,
  diagnostics: OperationalMetricsResponse | undefined,
): SystemState {
  const problems: string[] = [];
  let tone: SystemState["tone"] = "ok";

  if (summary && summary.status !== "online") {
    tone = "bad";
    problems.push("Server meldet sich offline");
  }
  if (readinessFailed || readiness?.status === "degraded") {
    tone = tone === "bad" ? tone : "warn";
    const failed = readiness?.checks.filter((check) => check.status === "failed") ?? [];
    problems.push(failed.length ? `${failed.length} Bereitschaftsprüfung(en) fehlgeschlagen` : "Bereitschaftsprüfung nicht erreichbar");
  }
  if (diagnostics?.degradedReasons.length) {
    tone = tone === "bad" ? tone : "warn";
    problems.push(`${diagnostics.degradedReasons.length} Betriebshinweis(e)`);
  }
  if (metrics) {
    const memory = percentOf(metrics.memory.usedBytes, metrics.memory.totalBytes);
    // Dieselben Laufwerke wie in der Anzeige (realDisks) — sonst zieht eine
    // fast volle EFI-/Boot-Partition den Gesamtstatus auf „Datenträger nahezu
    // voll", während die Kachel einen anderen Wert zeigt (F02-07).
    const disk = Math.max(0, ...realDisks(metrics.disks).map((entry) => entry.usedPercent));
    if (metrics.cpuPercent >= 90) { tone = "bad"; problems.push("CPU dauerhaft am Limit"); }
    else if (metrics.cpuPercent >= 75) { tone = tone === "ok" ? "warn" : tone; problems.push("hohe CPU-Last"); }
    if (memory >= 92) { tone = "bad"; problems.push("Arbeitsspeicher nahezu voll"); }
    else if (memory >= 80) { tone = tone === "ok" ? "warn" : tone; problems.push("Arbeitsspeicher wird knapp"); }
    if (disk >= 92) { tone = "bad"; problems.push("Datenträger nahezu voll"); }
    else if (disk >= 82) { tone = tone === "ok" ? "warn" : tone; problems.push("Datenträger füllt sich"); }
  }

  const label = tone === "warn" ? "Eingeschränkt" : tone === "bad" ? "Störung" : "";
  return {
    tone,
    label,
    detail: problems.join(" · "),
  };
}

export function DashboardHeader({
  summary,
  state,
  metrics,
}: {
  summary: Query<ServerSummary>;
  state: SystemState;
  metrics: Query<ServerMetrics>;
}) {
  const host = summary.data;

  return (
    <header className={`dash-head is-${state.tone}`}>
      <div className="dash-head-main">
        <h1>Dashboard</h1>
        <p className="dash-head-detail">{host?.serverName ?? "Dein Entwicklungsserver"}</p>
      </div>
      <div className="dash-head-side">
        {state.tone !== "ok" ? (
          <>
            <span className={`dash-pulse is-${state.tone}`}>
              <i aria-hidden />
              {state.label}
            </span>
            {state.detail ? <p className="dash-head-detail">{state.detail}</p> : null}
          </>
        ) : null}
        <span className="dash-meta-time">
          {metrics.data ? `Aktualisiert ${formatRelativeTime(metrics.data.lastUpdated)}` : "Verbindung wird geprüft"}
        </span>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------ Kennzahlen */

function Vital({
  label,
  value,
  unit,
  caption,
  trend,
  band,
  pending = false,
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  caption: string;
  trend?: { direction: "up" | "down" | "stable"; delta: number; invert?: boolean } | undefined;
  band: ReactNode;
  pending?: boolean;
}) {
  const trendTone = !trend || trend.direction === "stable"
    ? "is-stable"
    : (trend.direction === "up") !== Boolean(trend.invert)
      ? "is-rising"
      : "is-falling";
  return (
    <article className="dash-vital" aria-busy={pending || undefined}>
      <header>
        <span>{label}</span>
        {trend && trend.direction !== "stable" ? (
          <span className={`dash-delta ${trendTone}`}>
            {trend.direction === "up" ? "↑" : "↓"} {decimal.format(Math.abs(trend.delta))}
          </span>
        ) : null}
      </header>
      <p className="dash-vital-value">
        {pending ? <span className="dash-vital-placeholder dash-skeleton-line" aria-hidden /> : value}
        {!pending && unit ? <span>{unit}</span> : null}
      </p>
      <p className="dash-vital-caption">{pending ? <span className="dash-skeleton-line" aria-hidden /> : caption}</p>
      <div className="dash-vital-band">{band}</div>
    </article>
  );
}

export function VitalsBand({
  metrics,
  showMetrics,
}: {
  metrics: Query<ServerMetrics>;
  showMetrics: boolean;
}) {
  const samples = useMetricsHistory((state) => state.samples);
  const series = useMemo(() => ({
    cpu: samples.map((sample) => sample.cpuPercent),
    memory: samples.map((sample) => sample.memoryPercent),
  }), [samples]);

  if (!showMetrics) return null;
  const tiles: ReactNode[] = [];

  if (metrics.isPending) {
    for (const label of ["CPU", "Arbeitsspeicher", "Datenträger"]) {
      tiles.push(<Vital key={label} label={label} pending value="" caption=""
        band={<Meter value={0} label={`${label} wird geladen`} />} />);
    }
  } else if (metrics.isError) {
    tiles.push(<div className="dash-vital is-error" key="metrics-error"><PanelError message={queryMessage(metrics.error, "Systemwerte nicht verfügbar")} /></div>);
  } else {
    const data = metrics.data;
    const memoryPercent = percentOf(data.memory.usedBytes, data.memory.totalBytes);
    const busiestDisk = [...realDisks(data.disks)].sort((left, right) => right.usedPercent - left.usedPercent)[0];
    tiles.push(
      <Vital
        key="cpu"
        label="CPU"
        value={decimal.format(data.cpuPercent)}
        unit="%"
        caption={data.temperatureCelsius === null ? "Aktuelle Auslastung" : `Temperatur ${decimal.format(data.temperatureCelsius)} °C`}
        trend={computeTrend(series.cpu, 2)}
        band={series.cpu.length > 1
          ? <Sparkline values={series.cpu} tone={loadTone(data.cpuPercent, 60, 85)} />
          : <Meter value={data.cpuPercent} tone={loadTone(data.cpuPercent, 60, 85)} label="CPU-Auslastung" />}
      />,
      <Vital
        key="memory"
        label="Arbeitsspeicher"
        value={memoryPercent.toFixed(0)}
        unit="%"
        caption={`${formatBytes(data.memory.usedBytes)} von ${formatBytes(data.memory.totalBytes)} · ${formatBytes(data.memory.availableBytes)} frei`}
        trend={computeTrend(series.memory, 2)}
        band={series.memory.length > 1
          ? <Sparkline values={series.memory} tone={loadTone(memoryPercent, 75, 90)} />
          : <Meter value={memoryPercent} tone={loadTone(memoryPercent, 75, 90)} label="Arbeitsspeicher-Auslastung" />}
      />,
      <Vital
        key="disk"
        label="Datenträger"
        value={busiestDisk ? busiestDisk.usedPercent.toFixed(0) : "—"}
        unit={busiestDisk ? "%" : undefined}
        caption={busiestDisk ? `${formatBytes(busiestDisk.availableBytes)} frei` : "Keine Laufwerke erkannt"}
        band={<Meter value={busiestDisk?.usedPercent ?? 0} tone={loadTone(busiestDisk?.usedPercent ?? 0, 75, 90)} label="Belegung des vollsten Laufwerks" />}
      />,
    );
  }

  if (tiles.length === 0) return null;
  return <div className="dash-vitals">{tiles}</div>;
}

/* --------------------------------------------------------- Serverdiagnose */

export function ServerDiagnosticsPanel({
  summary,
  metrics,
}: {
  summary: Query<ServerSummary>;
  metrics: Query<ServerMetrics>;
}) {
  const samples = useMetricsHistory((state) => state.samples);
  const cpu = samples.map((sample) => sample.cpuPercent);
  const memory = samples.map((sample) => sample.memoryPercent);
  const host = summary.data;
  const disks = metrics.data ? realDisks(metrics.data.disks) : [];
  // Feste 0–100-Achse würde bei 2 % Auslastung nur eine Linie am Boden zeigen.
  // Die Skala wächst deshalb mit dem Spitzenwert, bleibt aber bei 0 verankert.
  const peak = Math.max(0, ...cpu, ...memory);
  const scaleMax = Math.min(100, Math.max(5, Math.ceil((peak * 1.35) / 5) * 5));
  // Die Achse folgt dem tatsächlichen Fenster (MAX_SAMPLES × Messintervall),
  // statt fest „vor 10 Min." zu behaupten (F02-06).
  const firstSample = samples[0]?.timestamp;
  const lastSample = samples[samples.length - 1]?.timestamp;
  const windowMinutes = firstSample && lastSample ? Math.max(1, Math.round((lastSample - firstSample) / 60_000)) : 5;
  const axisLabels = windowMinutes <= 1
    ? ["älter", "jetzt"]
    : [`vor ${windowMinutes} Min.`, `vor ${Math.max(1, Math.round(windowMinutes / 2))} Min.`, "jetzt"];

  return (
    <Panel
      title="Systemauslastung"
      subtitle={host ? `${host.serverName} · ${host.operatingSystem.distro}` : "Live-Werte des Entwicklungsservers"}
      icon={<ServerIcon className="h-4 w-4" />}
      name="server"
      className="is-span-7 dash-server-panel"
    >
      {summary.isError || metrics.isError ? (
        <PanelError message={queryMessage(summary.error ?? metrics.error, "Serverdaten konnten nicht geladen werden.")} />
      ) : (
        <div className="dash-server-body">
          <div className="dash-server-chart">
            <TrendChart
              height={148}
              bounds={{ min: 0, max: scaleMax }}
              scaleHint={`Skala 0–${scaleMax} %`}
              axisLabels={axisLabels}
              emptyHint="Messverlauf wird aufgebaut"
              series={[
                { id: "cpu", label: "CPU", values: cpu, tone: "accent" },
                {
                  id: "memory",
                  label: "Arbeitsspeicher",
                  values: memory,
                  tone: "ok",
                },
              ]}
            />
          </div>

          <div className="dash-server-side">
            <DashboardStorageList disks={disks} isPending={metrics.isPending} />
          </div>
        </div>
      )}
    </Panel>
  );
}

