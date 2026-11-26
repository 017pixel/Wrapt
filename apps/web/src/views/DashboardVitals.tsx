import type { ReactNode } from "react";
import type { ServerMetrics } from "@wrapt/contracts";
import { Meter, loadTone } from "../components/charts";
import { formatBytes } from "../lib/format";
import { PanelError, queryMessage, type DashboardQuery as Query } from "./DashboardPanels";
import { decimal, percentOf, realDisks } from "./dashboardMetrics";
import { formatLoadAverage } from "./DashboardServerFormatting";

const MEGABYTE = 1024 ** 2;

/**
 * Sekundenrate mit passender Einheit. Kleine Raten bleiben als KB/s sichtbar,
 * statt als 0,0 MB/s zu erscheinen. `null` bleibt `null`.
 */
export function formatByteRate(value: number | null | undefined): { value: string; unit: string } | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value >= MEGABYTE) return { value: decimal.format(value / MEGABYTE), unit: "MB/s" };
  return { value: decimal.format(value / 1024), unit: "KB/s" };
}

function Vital({
  label,
  value,
  unit,
  caption,
  band,
  pending = false,
  stale = false,
  compact = false,
}: {
  label: string;
  value: string;
  unit?: string | undefined;
  caption: string;
  band?: ReactNode | undefined;
  pending?: boolean;
  stale?: boolean;
  compact?: boolean;
}) {
  return (
    <article className={`dash-vital${stale ? " is-stale" : ""}`} aria-label={label} aria-busy={pending || undefined}>
      <header>
        <span>{label}</span>
        {stale ? <span className="dash-vital-stale">veraltet</span> : null}
      </header>
      <p className={`dash-vital-value${compact ? " is-compact" : ""}`}>
        {pending ? (
          <>
            <span className="dash-vital-placeholder dash-skeleton-line" aria-hidden />
            <span className="sr-only">{label} wird geladen</span>
          </>
        ) : (
          <>
            {value}
            {unit ? <span className="dash-vital-unit">{unit}</span> : null}
          </>
        )}
      </p>
      <p className="dash-vital-caption">
        {pending ? <span className="dash-skeleton-line" aria-hidden /> : caption}
      </p>
      {band ? <div className="dash-vital-band">{band}</div> : null}
    </article>
  );
}

function NetworkValue({ value }: { value: number | null | undefined }) {
  const rate = formatByteRate(value);
  return rate === null ? (
    <span className="dash-vital-missing">Nicht verfügbar</span>
  ) : (
    <>
      {rate.value}
      <span className="dash-vital-unit">{rate.unit}</span>
    </>
  );
}

function NetworkVital({
  network,
  pending,
  stale,
}: {
  network: ServerMetrics["network"];
  pending: boolean;
  stale: boolean;
}) {
  const received = formatByteRate(network?.receivedBytesPerSecond);
  const transmitted = formatByteRate(network?.transmittedBytesPerSecond);
  const available = received !== null || transmitted !== null;

  return (
    <article className={`dash-vital${stale ? " is-stale" : ""}`} aria-label="Netzwerk" aria-busy={pending || undefined}>
      <header>
        <span>Netzwerk</span>
        {stale ? <span className="dash-vital-stale">veraltet</span> : null}
      </header>
      {pending ? (
        <p className="dash-vital-value">
          <span className="dash-vital-placeholder dash-skeleton-line" aria-hidden />
          <span className="sr-only">Netzwerk wird geladen</span>
        </p>
      ) : network ? (
        <dl className="dash-vital-flow">
          <div>
            <dt>Empfangen</dt>
            <dd><NetworkValue value={network.receivedBytesPerSecond} /></dd>
          </div>
          <div>
            <dt>Senden</dt>
            <dd><NetworkValue value={network.transmittedBytesPerSecond} /></dd>
          </div>
        </dl>
      ) : (
        <p className="dash-vital-value">—</p>
      )}
      <p className="dash-vital-caption">
        {pending
          ? <span className="dash-skeleton-line" aria-hidden />
          : !network ? "Nicht verfügbar" : available ? "Aktuelle Übertragung" : "Keine Messwerte"}
      </p>
    </article>
  );
}

export function VitalsBand({
  metrics,
  showMetrics,
  metricsStale,
}: {
  metrics: Query<ServerMetrics>;
  showMetrics: boolean;
  metricsStale: boolean;
}) {
  if (!showMetrics) return null;

  const data = metrics.data;
  const metricsPending = metrics.isPending && !data;
  const metricsUnavailable = !data && !metricsPending;
  const memoryPercent = data ? percentOf(data.memory.usedBytes, data.memory.totalBytes) : 0;
  const temperature = data?.temperatureCelsius;
  const busiestDisk = data
    ? realDisks(data.disks).reduce<ServerMetrics["disks"][number] | undefined>((fullest, disk) =>
      !fullest || disk.usedPercent > fullest.usedPercent ? disk : fullest,
    undefined)
    : undefined;

  return (
    <section className="dash-vitals" aria-label="Systemkennzahlen">
      {metrics.isError ? (
        <PanelError
          message={queryMessage(metrics.error, "Systemwerte nicht verfügbar")}
          error={metrics.error}
          onRetry={() => void metrics.refetch()}
        />
      ) : null}

      <Vital
        label="CPU"
        value={data ? decimal.format(data.cpuPercent) : "—"}
        unit={data ? "%" : undefined}
        caption={metricsUnavailable ? "Nicht verfügbar" : "Aktuelle Auslastung"}
        pending={metricsPending}
        stale={metricsStale}
        band={data ? <Meter value={data.cpuPercent} tone={loadTone(data.cpuPercent, 75, 90)} label="CPU-Auslastung" /> : undefined}
      />
      <Vital
        label="Arbeitsspeicher"
        value={data ? memoryPercent.toFixed(0) : "—"}
        unit={data ? "%" : undefined}
        caption={data
          ? `${formatBytes(data.memory.usedBytes)} von ${formatBytes(data.memory.totalBytes)}`
          : metricsUnavailable ? "Nicht verfügbar" : ""}
        pending={metricsPending}
        stale={metricsStale}
        band={data ? <Meter value={memoryPercent} tone={loadTone(memoryPercent, 80, 92)} label="Arbeitsspeicher-Auslastung" /> : undefined}
      />
      <Vital
        label="Vollstes Laufwerk"
        value={busiestDisk ? busiestDisk.usedPercent.toFixed(0) : "—"}
        unit={busiestDisk ? "%" : undefined}
        caption={busiestDisk
          ? `${busiestDisk.mount} · ${formatBytes(busiestDisk.availableBytes)} frei`
          : data ? "Keine Laufwerke erkannt" : metricsUnavailable ? "Nicht verfügbar" : ""}
        pending={metricsPending}
        stale={metricsStale}
        band={busiestDisk ? <Meter value={busiestDisk.usedPercent} tone={loadTone(busiestDisk.usedPercent, 82, 92)} label="Belegung des vollsten Laufwerks" /> : undefined}
      />
      <NetworkVital network={data?.network} pending={metricsPending} stale={metricsStale} />
      <Vital
        label="Temperatur"
        value={typeof temperature === "number" ? decimal.format(temperature) : "—"}
        unit={typeof temperature === "number" ? "°C" : undefined}
        caption={data
          ? temperature === null ? "Kein Sensorwert" : "Aktueller Sensorwert"
          : metricsUnavailable ? "Nicht verfügbar" : ""}
        pending={metricsPending}
        stale={metricsStale}
      />
      <Vital
        label="Systemlast"
        value={data ? formatLoadAverage(data.loadAverage) : "—"}
        caption={data ? "1 / 5 / 15 Minuten" : metricsUnavailable ? "Nicht verfügbar" : ""}
        pending={metricsPending}
        stale={metricsStale}
        compact
      />
    </section>
  );
}
