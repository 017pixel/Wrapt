import type { ServerSummary, ServerMetrics, ReadinessResponse, OperationalMetricsResponse } from "@wrapt/contracts";
import { Link } from "react-router";
import { InfoIcon, ServerIcon } from "../components/icons";
import { formatBytes } from "../lib/format";
import { decimal, formatDateTime, realDisks } from "./dashboardMetrics";
import { formatServerUptime, formatTailscaleState } from "./DashboardServerFormatting";
import { formatByteRate } from "./DashboardVitals";
import { DashboardStorageList } from "./DashboardStorageList";
import { Facts, Panel, PanelError, PanelSkeleton, queryMessage, type DashboardQuery as Query } from "./DashboardPanels";
import "./dashboard-loading.css";

export interface DashboardSystemState {
  tone: "ok" | "warn" | "bad";
  label: string;
  detail: string;
}

interface SystemStateOptions {
  pending?: boolean;
  unavailable?: readonly string[];
  stale?: readonly string[];
}

export function deriveSystemState(
  summary: ServerSummary | undefined,
  readiness: ReadinessResponse | undefined,
  readinessFailed: boolean,
  metrics: ServerMetrics | undefined,
  diagnostics: OperationalMetricsResponse | undefined,
  options: SystemStateOptions = {},
): DashboardSystemState {
  const problems: string[] = [];
  const unavailable = options.unavailable ?? [];
  const stale = options.stale ?? [];
  let tone: DashboardSystemState["tone"] = "ok";

  if (summary && summary.status !== "online") {
    tone = "bad";
    problems.push("Server meldet sich offline");
  }
  if (readiness?.status === "degraded") {
    tone = tone === "bad" ? tone : "warn";
    const failed = readiness.checks.filter((check) => check.status === "failed");
    problems.push(failed.length
      ? `${failed.length} ${failed.length === 1 ? "Bereitschaftsprüfung" : "Bereitschaftsprüfungen"} fehlgeschlagen`
      : "Bereitschaft ist eingeschränkt");
  } else if (readinessFailed && !readiness && !unavailable.includes("Bereitschaft")) {
    tone = tone === "bad" ? tone : "warn";
    problems.push("Bereitschaftsprüfung nicht erreichbar");
  }
  if (diagnostics?.degradedReasons.length) {
    tone = tone === "bad" ? tone : "warn";
    const count = diagnostics.degradedReasons.length;
    problems.push(`${count} ${count === 1 ? "Betriebshinweis" : "Betriebshinweise"}`);
  }
  if (metrics) {
    const memory = metrics.memory.totalBytes > 0
      ? (metrics.memory.usedBytes / metrics.memory.totalBytes) * 100
      : 0;
    const disk = Math.max(0, ...realDisks(metrics.disks).map((entry) => entry.usedPercent));
    if (metrics.cpuPercent >= 90) { tone = "bad"; problems.push("CPU dauerhaft am Limit"); }
    else if (metrics.cpuPercent >= 75) { tone = tone === "ok" ? "warn" : tone; problems.push("hohe CPU-Last"); }
    if (memory >= 92) { tone = "bad"; problems.push("Arbeitsspeicher nahezu voll"); }
    else if (memory >= 80) { tone = tone === "ok" ? "warn" : tone; problems.push("Arbeitsspeicher wird knapp"); }
    if (disk >= 92) { tone = "bad"; problems.push("Datenträger nahezu voll"); }
    else if (disk >= 82) { tone = tone === "ok" ? "warn" : tone; problems.push("Datenträger füllt sich"); }
  }

  const operationalProblems = problems.length;
  if (unavailable.length) {
    if (unavailable.some((source) => source !== "Diagnose")) tone = "bad";
    else if (tone === "ok") tone = "warn";
    problems.push(`${unavailable.join(", ")} nicht verfügbar`);
  }
  if (stale.length) {
    if (tone === "ok") tone = "warn";
    problems.push(`${stale.join(", ")} veraltet`);
  }

  const criticalUnavailable = unavailable.filter((source) => source !== "Diagnose");
  const label = criticalUnavailable.length
    ? "Daten nicht verfügbar"
    : tone === "bad"
      ? "Störung"
      : unavailable.length
        ? "Diagnose nicht verfügbar"
        : tone === "warn"
          ? operationalProblems > 0 ? "Eingeschränkt" : "Daten veraltet"
          : options.pending ? "Wird geprüft" : "Betriebsbereit";

  return { tone, label, detail: problems.join(" · ") };
}

function revealDiagnostics() {
  const details = document.getElementById("dashboard-diagnostics")?.querySelector("details");
  if (details) details.open = true;
}

function formatRate(value: number | null | undefined): string {
  const rate = formatByteRate(value);
  return rate === null ? "Nicht verfügbar" : `${rate.value} ${rate.unit}`;
}

function formatCores(cpu: ServerMetrics["cpu"]): string {
  if (!cpu || cpu.cores <= 0) return "Nicht verfügbar";
  return cpu.physicalCores > 0 && cpu.physicalCores !== cpu.cores
    ? `${cpu.cores} (${cpu.physicalCores} physisch)`
    : String(cpu.cores);
}

function TemperatureList({ metrics }: { metrics: ServerMetrics | undefined }) {
  const temperatures = metrics?.cpu?.coreTemperatures ?? [];
  const cores = temperatures.flatMap((value, index) => typeof value === "number" && Number.isFinite(value)
    ? [{ label: `Kern ${index + 1}`, value }]
    : []);
  const sensor = metrics?.temperatureCelsius;
  const entries: { label: string; value: number }[] = cores.length
    ? cores
    : typeof sensor === "number" && Number.isFinite(sensor)
      ? [{ label: "Sensor", value: sensor }]
      : [];

  if (!entries.length) return <>{metrics ? "Keine Sensorwerte" : "Nicht verfügbar"}</>;
  return (
    <ul className="dash-core-temps">
      {entries.map((entry) => (
        <li key={entry.label}>
          <span>{entry.label}</span>
          <strong>{decimal.format(entry.value)} °C</strong>
        </li>
      ))}
    </ul>
  );
}

function ServerPerformance({ metrics, pending }: { metrics: ServerMetrics | undefined; pending: boolean }) {
  return (
    <section className="dash-server-performance">
      <p className="dash-subheading">Leistung</p>
      {pending ? (
        <PanelSkeleton label="Leistungswerte laden" rows={2} />
      ) : (
        <dl className="dash-server-metrics">
          <div>
            <dt>Festplatten-I/O</dt>
            <dd>{metrics?.diskIo
              ? <>Lesen {formatRate(metrics.diskIo.readBytesPerSecond)} · Schreiben {formatRate(metrics.diskIo.writeBytesPerSecond)}</>
              : "Nicht verfügbar"}</dd>
          </div>
          <div>
            <dt>Kerntemperaturen</dt>
            <dd><TemperatureList metrics={metrics} /></dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function ServerTopProcesses({ metrics, pending }: { metrics: ServerMetrics | undefined; pending: boolean }) {
  const processes = metrics?.topProcesses ?? [];
  return (
    <section className="dash-server-processes">
      <div className="dash-storage-heading">
        <p className="dash-subheading">Top-Prozesse</p>
        {!pending && processes.length ? <span>{processes.length}</span> : null}
      </div>
      {pending ? (
        <PanelSkeleton label="Prozesse laden" rows={4} />
      ) : processes.length ? (
        <table className="dash-process-table">
          <thead>
            <tr>
              <th scope="col">Prozess</th>
              <th scope="col">PID</th>
              <th scope="col">CPU</th>
              <th scope="col">RAM</th>
            </tr>
          </thead>
          <tbody>
            {processes.map((entry) => (
              <tr key={entry.pid}>
                <td title={entry.name}>{entry.name}</td>
                <td className="font-mono">{entry.pid}</td>
                <td className="font-mono">{decimal.format(entry.cpuPercent)} %</td>
                <td className="font-mono">{formatBytes(entry.memoryBytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="dash-muted">{metrics ? "Keine Prozessdaten verfügbar." : "Nicht verfügbar"}</p>
      )}
    </section>
  );
}

export function DashboardHeader({
  summary,
  state,
  metrics,
  diagnosticsVisible,
  summaryStale,
  metricsStale,
}: {
  summary: Query<ServerSummary>;
  state: DashboardSystemState;
  metrics: Query<ServerMetrics>;
  diagnosticsVisible: boolean;
  summaryStale: boolean;
  metricsStale: boolean;
}) {
  const host = summary.data;
  const summaryPending = summary.isPending && !host;
  const metricsPending = metrics.isPending && !metrics.data;
  const lastMeasurement = metrics.data?.lastUpdated ?? null;
  const measurementPending = metricsPending || (!metrics.data && summaryPending);
  const stale = summaryStale || metricsStale;

  return (
    <header className={`dash-head is-${state.tone}`} aria-busy={summaryPending || metricsPending || undefined}>
      <div className="dash-head-main">
        <div className="dash-head-title-row">
          <h1>Dashboard</h1>
          <span className={`dash-head-state is-${state.tone}`} aria-live="polite">{state.label}</span>
        </div>
        <p className="dash-head-detail dash-head-server">
          {summaryPending
            ? <span className="dash-skeleton-line" aria-hidden />
            : host?.serverName ?? "Server"}
        </p>
        {state.detail ? <p className="dash-head-detail dash-head-problems">{state.detail}</p> : null}
      </div>
      <div className="dash-head-side">
        <div className="dash-head-measurement">
          <span>Letzte Messung</span>
          {measurementPending ? (
            <span className="dash-skeleton-line" aria-hidden />
          ) : lastMeasurement ? (
            <time dateTime={lastMeasurement} title={lastMeasurement}>{formatDateTime(lastMeasurement)}</time>
          ) : (
            <span>Nicht verfügbar</span>
          )}
          {stale && lastMeasurement ? <span className="dash-head-stale">Daten veraltet</span> : null}
        </div>
        <nav className="dash-head-links" aria-label="Dashboard-Aktionen">
          <Link className="dash-link" to="/settings#einstellungen:navigation">Ansicht anpassen</Link>
          {diagnosticsVisible ? <a className="dash-link" href="#dashboard-diagnostics" onClick={revealDiagnostics}>Diagnose</a> : null}
        </nav>
      </div>
    </header>
  );
}

export function ServerDiagnosticsPanel({
  summary,
  metrics,
  summaryStale,
  metricsStale,
}: {
  summary: Query<ServerSummary>;
  metrics: Query<ServerMetrics>;
  summaryStale: boolean;
  metricsStale: boolean;
}) {
  const host = summary.data;
  const data = metrics.data;
  const disks = data ? realDisks(data.disks) : [];
  const summaryPending = summary.isPending && !host;
  const metricsPending = metrics.isPending && !data;
  const factsPending = summaryPending || metricsPending;
  const unavailable = "Nicht verfügbar";
  const staleSources = [summaryStale ? "Serverdaten" : null, metricsStale ? "Messwerte" : null]
    .filter((source): source is string => source !== null)
    .join(" und ");

  const facts = [
    { label: "Betriebssystem", value: host?.operatingSystem.distro || unavailable, mono: false },
    { label: "Release", value: host?.operatingSystem.release || unavailable, mono: false },
    { label: "Kernel", value: host?.operatingSystem.kernel || unavailable, mono: false },
    { label: "Prozessor", value: data?.cpu?.brand || unavailable, mono: false },
    { label: "Kerne", value: formatCores(data?.cpu), mono: false },
    { label: "Laufzeit", value: host ? formatServerUptime(host.uptimeSeconds) : unavailable, mono: false },
    { label: "Tailscale-DNS", value: host ? (host.tailscale.dnsName ?? "Keine DNS-Adresse") : unavailable },
    { label: "Tailscale-Zustand", value: host ? formatTailscaleState(host.tailscale.state) : unavailable, mono: false },
  ];

  return (
    <Panel
      title="Server"
      subtitle="System, Leistung und Laufwerke"
      icon={<ServerIcon className="h-4 w-4" />}
      name="server"
      className="dash-server-panel"
    >
      <div className="dash-server-body">
        {summary.isError || metrics.isError || staleSources ? (
          <div className="dash-server-notices">
            {summary.isError ? (
              <PanelError
                message={queryMessage(summary.error, "Serverdaten konnten nicht geladen werden.")}
                error={summary.error}
                onRetry={() => void summary.refetch()}
              />
            ) : null}
            {metrics.isError ? (
              <PanelError
                message={queryMessage(metrics.error, "Messwerte konnten nicht geladen werden.")}
                error={metrics.error}
                onRetry={() => void metrics.refetch()}
              />
            ) : null}
            {staleSources ? (
              <div className="dash-notice is-warn" role="status">
                <InfoIcon className="h-4 w-4 shrink-0" />
                <span>Gespeicherte Werte: {staleSources}. Eine neue Messung ist nicht verfügbar.</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {factsPending ? (
          <PanelSkeleton label="Serverdaten laden" rows={6} />
        ) : (
          <Facts min="132px" items={facts} />
        )}

        <ServerPerformance metrics={data} pending={metricsPending} />

        {data ? (
          <DashboardStorageList disks={disks} isPending={false} />
        ) : metricsPending ? (
          <DashboardStorageList disks={[]} isPending />
        ) : (
          <section className="dash-storage">
            <p className="dash-subheading">Laufwerke</p>
            <p className="dash-muted">Keine Laufwerksdaten verfügbar.</p>
          </section>
        )}

        <ServerTopProcesses metrics={data} pending={metricsPending} />
      </div>
    </Panel>
  );
}
