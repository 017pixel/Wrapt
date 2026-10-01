import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import type {
  DashboardSection,
  CommandsResponse,
  LocalPort,
  OperationalMetricsResponse,
  ReadinessResponse,
  ServiceMode,
  ServicesResponse,
  ServerMetrics,
  ServerSummary,
  UsageDashboardResponse,
} from "@wrapt/contracts";
import {
  CheckIcon,
  ChevronDownIcon,
  CommandIcon,
  CopyIcon,
  ExternalLinkIcon,
  InfoIcon,
  NetworkIcon,
  NutzungIcon,
  ServerIcon,
  ServicesIcon,
  ShieldIcon,
  WarningIcon,
} from "../components/icons";
import { Badge, StateDot } from "../components/primitives";
import { Meter, Sparkline, TrendChart, loadTone } from "../components/charts";
import { formatBytes, formatRelativeTime } from "../lib/format";
import { computeTrend, useMetricsHistory } from "../stores/metricsHistory";
import { wraptQueries } from "../lib/queryOptions";
import { getDashboardArtwork } from "../lib/dashboardArtwork";
import { useDashboardPreferences, isDashboardSectionVisible } from "../stores/dashboardPreferences";
import { useLayoutStore } from "../stores/layout";
import { useRouteActivity } from "../lib/routeActivity";
import { writeClipboardText } from "../lib/clipboard";
import { ContentDialog } from "../components/ModalDialog";
import { runWithViewTransition } from "../lib/viewTransition";
import { DashboardMobileSummary } from "./DashboardMobileSummary";
import { Panel, PanelError, PanelSkeleton, queryMessage } from "./DashboardPanels";
import { RuntimePanel } from "./DashboardRuntime";
import { DashboardRecentProjects } from "./DashboardRecentProjects";
import { DashboardStorageList } from "./DashboardStorageList";
import "./dashboard-artwork.css";

const integer = new Intl.NumberFormat("de-DE");
const decimal = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

const dashboardSections: DashboardSection[] = [
  "quickActions",
  "server",
  "metrics",
  "services",
  "runtime",
  "diagnostics",
  "usage",
  "commands",
];

type Query<T> = UseQueryResult<T, Error>;

const readinessCheckLabels: Record<string, string> = {
  database: "Datenbank",
  "data-directory": "Datenverzeichnis",
};

function serverModeLabel(mode: ServiceMode): string {
  return mode === "embedded" ? "eingebettet" : mode === "external" ? "extern" : "hybrid";
}

function formatDateTime(value: string | null): string {
  if (!value) return "nicht verfügbar";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "nicht verfügbar";
}

function percentOf(used: number, total: number): number {
  return total > 0 ? (used / total) * 100 : 0;
}

/**
 * Linux meldet auch Pseudo-Dateisysteme wie `/boot/efi/efivars` mit wenigen
 * Kilobyte. Die verfälschen jede „vollstes Laufwerk“-Aussage, deshalb bleiben
 * nur Laufwerke ab einem Gigabyte übrig.
 */
function realDisks(disks: ServerMetrics["disks"]): ServerMetrics["disks"] {
  const relevant = disks.filter((disk) => disk.totalBytes >= 1024 ** 3);
  return relevant.length ? relevant : disks;
}

/* ---------------------------------------------------------------- Bausteine */

/**
 * Das Raster füllt die verfügbare Breite selbst auf. `min` ist die
 * Mindestbreite einer Spalte, nicht ihre Anzahl — dadurch passen sich die
 * Fakten an, wenn ein Bento-Panel schmaler wird.
 */
function Facts({ items, min = "132px" }: { items: { label: string; value: string; mono?: boolean }[]; min?: string }) {
  return (
    <dl className="dash-facts" style={{ "--dash-fact-min": min } as CSSProperties}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.mono === false ? "" : "font-mono"}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------- Kopf */

interface SystemState {
  tone: "ok" | "warn" | "bad";
  label: string;
  detail: string;
}

function deriveSystemState(
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

function DashboardHeader({
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
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  caption: string;
  trend?: { direction: "up" | "down" | "stable"; delta: number; invert?: boolean } | undefined;
  band: ReactNode;
}) {
  const trendTone = !trend || trend.direction === "stable"
    ? "is-stable"
    : (trend.direction === "up") !== Boolean(trend.invert)
      ? "is-rising"
      : "is-falling";
  return (
    <article className="dash-vital">
      <header>
        <span>{label}</span>
        {trend && trend.direction !== "stable" ? (
          <span className={`dash-delta ${trendTone}`}>
            {trend.direction === "up" ? "↑" : "↓"} {decimal.format(Math.abs(trend.delta))}
          </span>
        ) : null}
      </header>
      <p className="dash-vital-value">
        {value}
        {unit ? <span>{unit}</span> : null}
      </p>
      <p className="dash-vital-caption">{caption}</p>
      <div className="dash-vital-band">{band}</div>
    </article>
  );
}

function VitalsBand({
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
    tiles.push(<div className="dash-vital" key="metrics-loading"><PanelSkeleton label="Systemwerte laden" rows={3} /></div>);
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

function ServerDiagnosticsPanel({
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
              height={samples.length > 1 ? 148 : 96}
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

/* ------------------------------------------------------ Wrapt-Diagnose */

function ReadinessList({ readiness }: { readiness: Query<ReadinessResponse> }) {
  if (readiness.isPending) return <PanelSkeleton label="Bereitschaft wird geprüft" rows={2} />;
  if (readiness.isError) {
    return <PanelError message={queryMessage(readiness.error, "Die Bereitschaftsprüfung antwortet nicht. Das Backend meldet sich als eingeschränkt.")} />;
  }
  return (
    <ul className="dash-check-list">
      {readiness.data.checks.map((check) => (
        <li key={check.name}>
          <StateDot state={check.status === "ok" ? "active" : "error"} />
          <span className="dash-check-name">{readinessCheckLabels[check.name] ?? check.name}</span>
          <strong className={check.status === "ok" ? "is-ok" : "is-bad"}>{check.status === "ok" ? "in Ordnung" : "fehlgeschlagen"}</strong>
        </li>
      ))}
      {readiness.data.checks.length === 0 ? <li className="dash-muted">Keine Prüfungen konfiguriert.</li> : null}
    </ul>
  );
}

function WorkbenchDiagnosticsPanel({
  diagnostics,
  readiness,
}: {
  diagnostics: Query<OperationalMetricsResponse>;
  readiness: Query<ReadinessResponse>;
}) {
  const data = diagnostics.data;
  const routes = data?.http.routes.slice(0, 6) ?? [];
  const slowestRoute = Math.max(1, ...routes.map((route) => route.p99Milliseconds));

  return (
    <Panel
      title="Betriebsdiagnose"
      subtitle="Technische Messwerte und Systemhinweise"
      icon={<ShieldIcon className="h-4 w-4" />}
      name="workbench"
      className="is-span-12"
      meta={
        data ? (
          <Badge tone={data.degradedReasons.length ? "warn" : "ok"}>
            {data.degradedReasons.length ? `${data.degradedReasons.length} Hinweise` : "Betrieb unauffällig"}
          </Badge>
        ) : null
      }
    >
      {diagnostics.isError ? (
        <PanelError message={queryMessage(diagnostics.error, "Diagnosedaten konnten nicht geladen werden.")} />
      ) : diagnostics.isPending ? (
        <PanelSkeleton label="Diagnose lädt" rows={4} />
      ) : (
        <div className="dash-diagnostics-body">
          <div>
            <p className="dash-subheading">Bereitschaft</p>
            <ReadinessList readiness={readiness} />

            <p className="dash-subheading">Betriebshinweise</p>
            {data!.degradedReasons.length ? (
              <ul className="dash-reason-list">
                {data!.degradedReasons.map((reason) => (
                  <li key={reason}>
                    <WarningIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-muted">Der Dienst meldet keine Einschränkungen.</p>
            )}

            <p className="dash-subheading">Hintergrund</p>
            <Facts
              min="100%"
              items={[
                { label: "Audit", value: data!.audit.valid ? `gültig · ${integer.format(data!.audit.entries)} Einträge` : "Prüfung erforderlich" },
                { label: "Letzter Audit-Eintrag", value: data!.audit.latestAt ? formatDateTime(data!.audit.latestAt) : "keiner" },
                { label: "Offene Orbit-Backups", value: integer.format(data!.orbit.pendingBackups) },
                { label: "Orbit-Fehler", value: data!.orbit.lastError ?? "keiner" },
              ]}
            />
          </div>

          <div>
            <p className="dash-subheading">Prozess und Anfragen</p>
            <Facts
              items={[
                { label: "Anfragen gesamt", value: integer.format(data!.http.totalRequests) },
                { label: "Gerade aktiv", value: integer.format(data!.http.activeRequests) },
                { label: "Clientfehler (4xx)", value: integer.format(data!.http.clientErrors) },
                { label: "Serverfehler (5xx)", value: integer.format(data!.http.serverErrors) },
                { label: "Event-Loop Ø", value: `${decimal.format(data!.eventLoop.meanMilliseconds)} ms` },
                { label: "Event-Loop max", value: `${decimal.format(data!.eventLoop.maxMilliseconds)} ms` },
                { label: "RSS", value: formatBytes(data!.processMemory.rssBytes) },
                { label: "Extern", value: formatBytes(data!.processMemory.externalBytes) },
              ]}
            />
            <div className="dash-gauge">
              <div>
                <span>Heap</span>
                <strong className="font-mono">
                  {formatBytes(data!.processMemory.heapUsedBytes)} / {formatBytes(data!.processMemory.heapTotalBytes)}
                </strong>
              </div>
              <Meter
                value={percentOf(data!.processMemory.heapUsedBytes, data!.processMemory.heapTotalBytes)}
                tone={loadTone(percentOf(data!.processMemory.heapUsedBytes, data!.processMemory.heapTotalBytes), 90, 97)}
                label="Heap-Auslastung"
              />
            </div>
            <div className="dash-gauge">
              <div>
                <span>Preview-Slots</span>
                <strong className="font-mono">{data!.preview.freeSlots} von {data!.preview.totalSlots} frei</strong>
              </div>
              <Meter
                value={percentOf(data!.preview.totalSlots - data!.preview.freeSlots, data!.preview.totalSlots)}
                tone={data!.preview.quarantinedSlots > 0 ? "warn" : "accent"}
                label="Belegte Preview-Slots"
              />
              <small>{data!.preview.resettingSlots} werden zurückgesetzt · {data!.preview.quarantinedSlots} in Quarantäne</small>
            </div>
          </div>

          <div>
            <p className="dash-subheading">Langsamste Routen</p>
            {routes.length ? (
              <ul className="dash-route-list">
                {routes.map((route) => (
                  <li key={`${route.method}-${route.route}`}>
                    <div className="dash-route-head">
                      <span className="font-mono">
                        <b>{route.method}</b> {route.route}
                      </span>
                      <strong className="font-mono">{decimal.format(route.p99Milliseconds)} ms</strong>
                    </div>
                    <Meter
                      value={(route.p99Milliseconds / slowestRoute) * 100}
                      tone={route.errorCount > 0 ? "bad" : loadTone(route.p99Milliseconds, 250, 800)}
                      label={`P99 von ${route.method} ${route.route}`}
                    />
                    <small className="font-mono">
                      {integer.format(route.count)} Aufrufe · P95 {decimal.format(route.p95Milliseconds)} ms · {integer.format(route.errorCount)} Fehler
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dash-muted">Seit dem Start wurden noch keine Routen gemessen.</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- Betrieb */

function ServicesPanel({ services }: { services: Query<ServicesResponse> }) {
  const data = services.data;
  const online = data?.services.filter((service) => service.state === "active").length ?? 0;
  return (
    <Panel
      title="Dienste"
      subtitle={data ? `${online} von ${data.services.length} aktiv` : "Konfigurierte Dienste"}
      icon={<ServicesIcon className="h-4 w-4" />}
      name="services"
      className="is-span-5 dash-services-panel"
    >
      {services.isError ? (
        <PanelError message={queryMessage(services.error, "Dienste konnten nicht geladen werden.")} />
      ) : !data ? (
        <PanelSkeleton label="Dienste laden" rows={3} />
      ) : data.services.length === 0 ? (
        <p className="dash-muted">Keine Dienste konfiguriert.</p>
      ) : (
        <ul className="dash-service-list">
          {data.services.map((service) => (
            <li key={service.id}>
              <StateDot state={service.state} pulse={service.state === "checking"} />
              <div>
                <strong>{service.name}</strong>
                <small>{service.message ?? serverModeLabel(service.mode)}</small>
              </div>
              {service.publicUrl ? (
                <a href={service.publicUrl} target="_blank" rel="noopener noreferrer" className="dash-link" aria-label={`${service.name} öffnen`}>
                  Öffnen <ExternalLinkIcon className="h-3 w-3" />
                </a>
              ) : (
                <Badge>{serverModeLabel(service.mode)}</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- Nebenwerte */

function UsagePanel({ usage }: { usage: Query<UsageDashboardResponse> }) {
  const data = usage.data;
  const windows = data
    ? data.live.providers
        .flatMap((provider) => provider.accounts.flatMap((account) => account.windows.map((window) => ({ provider, account, window }))))
        .sort((left, right) => {
          const providerDifference = left.provider.providerName.localeCompare(right.provider.providerName, "de");
          if (providerDifference) return providerDifference;
          const leftAccount = left.account.email ?? left.account.label;
          const rightAccount = right.account.email ?? right.account.label;
          const accountDifference = leftAccount.localeCompare(rightAccount, "de");
          return accountDifference || left.window.id.localeCompare(right.window.id, "de");
        })
    : [];

  return (
    <Panel
      title="Nutzung und Limits"
      subtitle={data ? `Datenstand ${formatRelativeTime(data.live.lastSuccessfulFetchAt ?? data.live.fetchedAt)}` : "Limits der verbundenen Konten"}
      icon={<NutzungIcon className="h-4 w-4" />}
      name="usage"
      className="is-span-5"
      meta={<Link className="dash-link" to="/usage">Alle Limits</Link>}
    >
      {usage.isError ? (
        <PanelError message={queryMessage(usage.error, "Nutzungsdaten konnten nicht geladen werden.")} />
      ) : usage.isPending ? (
        <PanelSkeleton label="Nutzung lädt" rows={3} />
      ) : (
        <>
          <Facts
            min="120px"
            items={[
              { label: "Tokens heute", value: integer.format(data!.totals.todayTokens) },
              { label: "Tokens 30 Tage", value: integer.format(data!.totals.totalTokens) },
              { label: "Kosten 30 Tage", value: money.format(data!.totals.totalCost) },
            ]}
          />
          <div className="dash-limit-list">
            {windows.length ? (
              windows.map(({ provider, account, window }) => (
                <div key={`${provider.providerId}-${account.id}-${window.id}`}>
                  <div className="dash-limit-head">
                    <span>{provider.providerName} · {account.email ?? account.label}</span>
                    <strong className="font-mono">{window.remainingPercent} % frei</strong>
                  </div>
                  <Meter value={window.usedPercent} tone={loadTone(window.usedPercent, 65, 85)} label={`${window.label} verbraucht`} />
                  <small>{window.label} · Reset {formatDateTime(window.resetsAt)}</small>
                </div>
              ))
            ) : (
              <p className="dash-muted">Für die verbundenen Konten liegen keine Limitfenster vor.</p>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copy = async () => {
    try {
      await writeClipboardText(value);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1_500);
    } catch {
      setCopyState("error");
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      title={copyState === "error" ? "Kopieren wurde vom Browser nicht erlaubt" : "Kopieren"}
      className="quiet-button shrink-0 text-[12px] max-md:text-[13px]"
    >
      {copyState === "copied" ? <CheckIcon className="h-3.5 w-3.5 text-ok" /> : <CopyIcon className={`h-3.5 w-3.5 ${copyState === "error" ? "text-bad" : ""}`} />}
      <span aria-live="polite">{copyState === "copied" ? "Kopiert" : copyState === "error" ? "Fehlgeschlagen" : "Kopieren"}</span>
    </button>
  );
}

function CommandsPanel({
  commands,
  onSelect,
}: {
  commands: Query<CommandsResponse>;
  onSelect: (command: { name: string; description: string; command: string }) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const all = commands.data?.commands ?? [];
  const visible = expanded ? all : all.slice(0, 4);

  return (
    <Panel
      title="Befehle"
      subtitle="Nachschlagen und kopieren, keine Ausführung"
      icon={<CommandIcon className="h-4 w-4" />}
      name="commands"
      className="is-span-8"
    >
      {commands.isError ? (
        <PanelError message={queryMessage(commands.error, "Befehle konnten nicht geladen werden.")} />
      ) : commands.isPending ? (
        <PanelSkeleton label="Befehle laden" rows={2} />
      ) : (
        <>
          <ul className="dash-command-list">
            {visible.map((command) => (
              <li key={command.id}>
                <div>
                  <strong>{command.name}</strong>
                  <small>{command.description}</small>
                </div>
                <code className="font-mono">{command.command}</code>
                <button type="button" className="quiet-button dash-command-view" onClick={() => onSelect(command)}>
                  Anzeigen
                </button>
                <CopyButton value={command.command} />
              </li>
            ))}
          </ul>
          {all.length > 4 ? (
            <button type="button" className="dash-more" onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}>
              {expanded ? "Weniger anzeigen" : `${all.length - 4} weitere Befehle anzeigen`}
            </button>
          ) : null}
        </>
      )}
    </Panel>
  );
}

function AdvancedDashboardPanel({
  diagnosticsVisible,
  commandsVisible,
  diagnostics,
  readiness,
  commands,
  onSelect,
}: {
  diagnosticsVisible: boolean;
  commandsVisible: boolean;
  diagnostics: Query<OperationalMetricsResponse>;
  readiness: Query<ReadinessResponse>;
  commands: Query<CommandsResponse>;
  onSelect: (command: { name: string; description: string; command: string }) => void;
}) {
  if (!diagnosticsVisible && !commandsVisible) return null;
  const description = diagnosticsVisible && commandsVisible ? "Diagnose · Befehle" : diagnosticsVisible ? "Diagnose" : "Befehle";
  const issueCount = diagnosticsVisible ? diagnostics.data?.degradedReasons.length ?? 0 : 0;

  return (
    <details className="dash-panel dash-advanced-panel is-span-12">
      <summary className="dash-advanced-summary">
        <span className="dash-panel-icon"><ShieldIcon className="h-4 w-4" /></span>
        <span className="dash-advanced-copy">
          <strong>Technische Details</strong>
          <small>{issueCount ? `${issueCount} Betriebshinweise` : description}</small>
        </span>
        <ChevronDownIcon className="dash-advanced-chevron h-4 w-4" aria-hidden="true" />
      </summary>
      <div className="dash-advanced-body">
        {diagnosticsVisible ? <WorkbenchDiagnosticsPanel diagnostics={diagnostics} readiness={readiness} /> : null}
        {commandsVisible ? <CommandsPanel commands={commands} onSelect={onSelect} /> : null}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ Seite */

export function Dashboard() {
  const navigate = useNavigate();
  const routeActive = useRouteActivity();
  const configQuery = useQuery({ ...wraptQueries.dashboardConfig(), enabled: routeActive });
  const config = configQuery.data;
  const hiddenSections = useDashboardPreferences((state) => state.hiddenSections);
  const artworkEnabled = useDashboardPreferences((state) => state.artworkEnabled);
  const artworkId = useDashboardPreferences((state) => state.artworkId);
  const artwork = getDashboardArtwork(artworkId);
  const selectProject = useLayoutStore((state) => state.selectProject);
  const visible = (section: DashboardSection) => isDashboardSectionVisible(config, hiddenSections, section);
  const refresh = config?.refresh;

  const serverVisible = visible("server");
  const metricsVisible = visible("metrics");
  const diagnosticsVisible = visible("diagnostics");
  const runtimeVisible = visible("runtime");
  const projectActivityVisible = visible("quickActions");
  const servicesVisible = visible("services");
  const usageVisible = visible("usage");
  const commandsVisible = visible("commands");

  // Der Kopf braucht Server- und Dienstzustand unabhängig von der Sichtbarkeit
  // einzelner Dashboard-Kacheln.
  const summary = useQuery({ ...wraptQueries.serverSummary(refresh?.summaryMilliseconds), enabled: routeActive });
  const readiness = useQuery({ ...wraptQueries.readiness(refresh?.summaryMilliseconds), retry: false, enabled: routeActive });
  const metrics = useQuery({ ...wraptQueries.serverMetrics(refresh?.metricsMilliseconds), enabled: routeActive });
  const diagnostics = useQuery({ ...wraptQueries.operationalMetrics(refresh?.operationalMetricsMilliseconds), enabled: routeActive });
  const services = useQuery({ ...wraptQueries.services(refresh?.servicesMilliseconds), enabled: routeActive && servicesVisible });
  const projects = useQuery({ ...wraptQueries.projects(), enabled: routeActive && (runtimeVisible || projectActivityVisible) });
  const ports = useQuery({ ...wraptQueries.localPorts(refresh?.localPortsMilliseconds), enabled: routeActive && runtimeVisible });
  const sessions = useQuery({ ...wraptQueries.terminalSessions(refresh?.terminalSessionsMilliseconds), enabled: routeActive && runtimeVisible });
  const usage = useQuery({ ...wraptQueries.usageDashboard("30d", refresh?.usageMilliseconds), enabled: routeActive && usageVisible });
  const commands = useQuery({ ...wraptQueries.commands(), enabled: routeActive && commandsVisible });
  const [selectedCommand, setSelectedCommand] = useState<{ name: string; description: string; command: string } | null>(null);
  const systemState = deriveSystemState(summary.data, readiness.data, readiness.isError, metrics.data, diagnostics.data);
  const openPort = (port: LocalPort) => {
    if (port.projectId) selectProject(port.projectId);
    navigate("/previews");
  };
  const visibleCount = dashboardSections.filter(visible).length;

  return (
    <div
      className={`page-scroll ${artworkEnabled ? "dash-has-artwork" : ""}`}
      style={artworkEnabled ? { "--dashboard-artwork-image": `url("${artwork.src}")` } as CSSProperties : undefined}
    >
      <div className="page-frame dash">
        <DashboardHeader summary={summary} state={systemState} metrics={metrics} />
        <DashboardMobileSummary
          state={systemState}
          serverName={summary.data?.serverName ?? "Dein Entwicklungsserver"}
          liveLabel={metrics.data ? `Aktualisiert ${formatRelativeTime(metrics.data.lastUpdated)}` : "Verbindung wird geprüft"}
        />
        {configQuery.isError ? (
          <div className="dash-notice is-warn" role="status">
            <InfoIcon className="h-4 w-4 shrink-0" />
            <span>Die Dashboard-Konfiguration ist nicht erreichbar. Es gelten die Standardwerte.</span>
          </div>
        ) : null}

        <VitalsBand metrics={metrics} showMetrics={metricsVisible} />

        <div className="dash-bento">
          {serverVisible ? <ServerDiagnosticsPanel summary={summary} metrics={metrics} /> : null}
          {projectActivityVisible ? <DashboardRecentProjects projects={projects} /> : null}
          {servicesVisible ? <ServicesPanel services={services} /> : null}
          {runtimeVisible ? <RuntimePanel ports={ports} sessions={sessions} projects={projects} onOpenPort={openPort} /> : null}
          {usageVisible ? <UsagePanel usage={usage} /> : null}
          <AdvancedDashboardPanel
            diagnosticsVisible={diagnosticsVisible}
            commandsVisible={commandsVisible}
            diagnostics={diagnostics}
            readiness={readiness}
            commands={commands}
            onSelect={setSelectedCommand}
          />
        </div>

        {visibleCount === 0 ? (
          <div className="dash-empty">
            <NetworkIcon className="h-5 w-5" />
            <strong>Alle Bereiche ausgeblendet</strong>
            <span>In den Einstellungen lassen sich die Dashboard-Bereiche wieder einschalten.</span>
            <button type="button" className="quiet-button" onClick={() => navigate("/settings")}>
              Einstellungen öffnen
            </button>
          </div>
        ) : null}

        <ContentDialog
          open={selectedCommand !== null}
          title={selectedCommand?.name ?? "Befehl"}
          description={selectedCommand?.description}
          onClose={() => setSelectedCommand(null)}
        >
          <code className="command-dialog-code">{selectedCommand?.command}</code>
          {selectedCommand ? <CopyButton value={selectedCommand.command} /> : null}
        </ContentDialog>
      </div>
    </div>
  );
}
