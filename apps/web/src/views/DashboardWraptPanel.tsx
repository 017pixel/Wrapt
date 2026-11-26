import { Link } from "react-router";
import type {
  HealthResponse,
  HermesStatus,
  NotificationListResponse,
  OperationalMetricsResponse,
  ServicesResponse,
  T3ChannelStatusResponse,
  UpdateStatusResponse,
} from "@wrapt/contracts";
import { ChevronRightIcon, RefreshIcon, WarningIcon, WraptIcon } from "../components/icons";
import { stripAppBase } from "../lib/appUrl";
import { updateStatusLabel, updateStatusTone } from "../lib/updateAgentPrompt";
import { Panel, type DashboardQuery as Query } from "./DashboardPanels";
import { decimal, formatDateTime } from "./dashboardMetrics";
import "./dashboard-overview-panels.css";

export interface DashboardWraptPanelProps {
  health: Query<HealthResponse>;
  updateStatus: Query<UpdateStatusResponse>;
  t3Channel: Query<T3ChannelStatusResponse>;
  hermesStatus: Query<HermesStatus>;
  services: Query<ServicesResponse>;
  operationalMetrics: Query<OperationalMetricsResponse>;
  notifications: Query<NotificationListResponse>;
}

interface OverviewEntry {
  label: string;
  value: string;
  detail: string;
  to?: string;
  tone?: "warn" | "bad" | undefined;
}

const channelLabels: Record<T3ChannelStatusResponse["configuredChannel"], string> = {
  stable: "Stable",
  nightly: "Nightly",
};

const serviceStateLabels: Record<ServicesResponse["services"][number]["state"], string> = {
  active: "aktiv",
  inactive: "inaktiv",
  error: "Fehler",
  unknown: "unbekannt",
  checking: "in Prüfung",
};

function queryFallback(query: { data?: unknown; isPending: boolean; isError: boolean }): string {
  if (query.isError && query.data === undefined) return "Nicht verfügbar";
  if (query.isPending && query.data === undefined) return "Wird geladen …";
  return "Unbekannt";
}

function formatBuildDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  if (milliseconds < 60_000) return `${decimal.format(milliseconds / 1_000)} s`;
  return `${decimal.format(milliseconds / 60_000)} min`;
}

function timestampFromMilliseconds(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function hermesState(status: HermesStatus): { label: string; tone?: "warn" | "bad" } {
  if (!status.enabled) return { label: "Deaktiviert" };
  if (!status.installed) return { label: "Nicht installiert", tone: "warn" };
  if (status.dashboard.state === "failed" || status.gateway.state === "failed") return { label: "Fehler", tone: "bad" };
  if (!status.reachable || !status.chat.ready) return { label: "Nicht bereit", tone: "warn" };
  return { label: "Bereit" };
}

function updateTone(status: UpdateStatusResponse | undefined): "warn" | "bad" | undefined {
  const tone = updateStatusTone(status);
  if (tone === "bad") return "bad";
  if (tone === "warn") return "warn";
  return undefined;
}

function OverviewLink({ entry }: { entry: OverviewEntry }) {
  const content = (
    <>
      <span className="dash-overview-label">{entry.label}</span>
      <span className="dash-overview-copy">
        <strong data-tone={entry.tone ?? "default"}>{entry.value}</strong>
        <small title={entry.detail}>{entry.detail}</small>
      </span>
    </>
  );
  return (
    <li>
      {entry.to ? (
        <Link className="dash-overview-link" to={entry.to}>
          {content}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <div className="dash-overview-link hover:bg-transparent">{content}</div>
      )}
    </li>
  );
}

export function DashboardWraptPanel({
  health,
  updateStatus,
  t3Channel,
  hermesStatus,
  services,
  operationalMetrics,
  notifications,
}: DashboardWraptPanelProps) {
  const update = updateStatus.data;
  const updateStale = update
    ? Date.now() - Date.parse(update.checkedAt) > 10 * 60_000
    : false;
  const t3 = t3Channel.data;
  const hermes = hermesStatus.data;
  const serviceData = services.data;
  const metrics = operationalMetrics.data;
  const notificationData = notifications.data;
  const dirtyCount = update?.dirtyCount ?? update?.dirtyFiles.length ?? 0;
  const activeServices = serviceData?.services.filter((service) => service.state === "active").length ?? 0;
  const otherServices = serviceData?.services
    .filter((service) => service.state !== "active")
    .sort((left, right) => Number(right.state === "error") - Number(left.state === "error")) ?? [];
  const hermesSummary = hermes ? hermesState(hermes) : { label: queryFallback(hermesStatus), tone: undefined };
  const unreadNotifications = notificationData?.notifications
    .filter((notification) => notification.readAt === null && notification.deletedAt === null)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)) ?? [];
  const latestNotification = unreadNotifications[0];
  const latestBuildAt = metrics?.build.latestCreatedAt
    ?? timestampFromMilliseconds(health.data?.webBuildId);
  const backup = metrics?.extensions.backup;
  const failedQueries = [
    { label: "Version", query: health },
    { label: "Update", query: updateStatus },
    { label: "T3 Code", query: t3Channel },
    { label: "Hermes", query: hermesStatus },
    { label: "Dienste", query: services },
    { label: "Betrieb", query: operationalMetrics },
    { label: "Ereignisse", query: notifications },
  ].filter(({ query }) => query.isError);
  const hasStaleValues = failedQueries.some(({ query }) => query.data !== undefined);
  const retryFailedQueries = () => {
    void Promise.all(failedQueries.map(({ query }) => query.refetch() as Promise<unknown>));
  };

  const entries: OverviewEntry[] = [
    {
      label: "Version",
      value: health.data?.version ?? update?.version ?? queryFallback(health),
      detail: health.data
        ? [health.data.appName, health.data.instanceName].filter(Boolean).join(" · ")
        : queryFallback(health),
      to: "/settings#einstellungen:allgemein",
    },
    {
      label: "Update",
      value: update ? updateStatusLabel(update) : queryFallback(updateStatus),
      detail: update
        ? `${updateStale ? "Veraltet · " : ""}Zuletzt geprüft ${formatDateTime(update.checkedAt)}`
        : queryFallback(updateStatus),
      tone: updateTone(update) === undefined && updateStale ? "warn" : updateTone(update),
      to: "/settings#einstellungen:system",
    },
    {
      label: "Lokale Änderungen",
      value: update
        ? (update.dirty ? `${dirtyCount} ${dirtyCount === 1 ? "Änderung" : "Änderungen"}` : "Keine lokalen Änderungen")
        : queryFallback(updateStatus),
      detail: update?.dirty
        ? "Vor einem Update prüfen"
        : update ? "Bereit für das nächste Update" : queryFallback(updateStatus),
      tone: update?.dirty ? "warn" : undefined,
      to: "/settings#einstellungen:system",
    },
    {
      label: "T3 Code",
      value: t3
        ? (t3.installed
          ? `${channelLabels[t3.activeChannel ?? t3.configuredChannel]} · ${t3.activeVersion ? `v${t3.activeVersion}` : "Version unbekannt"}`
          : "Nicht installiert")
        : queryFallback(t3Channel),
      detail: t3
        ? (t3.restartRequired
          ? `${channelLabels[t3.configuredChannel]} gespeichert · Neustart nötig`
          : t3.installed
            ? `${channelLabels[t3.configuredChannel]} installiert`
            : "Installation nicht gefunden")
        : queryFallback(t3Channel),
      tone: t3?.restartRequired ? "warn" : undefined,
      to: "/settings#einstellungen:system",
    },
    {
      label: "Hermes",
      value: hermesSummary.label,
      detail: hermes
        ? [
          hermes.version ?? "Version unbekannt",
          `${hermes.chat.activeSessions} ${hermes.chat.activeSessions === 1 ? "aktive Session" : "aktive Sessions"}`,
        ].join(" · ")
        : queryFallback(hermesStatus),
      tone: hermesSummary.tone,
      to: "/hermes-agent",
    },
    {
      label: "Dienste",
      value: serviceData
        ? (serviceData.services.length ? `${activeServices} von ${serviceData.services.length} aktiv` : "Keine Dienste")
        : queryFallback(services),
      detail: serviceData
        ? (!serviceData.services.length
          ? "Keine Dienste konfiguriert"
          : otherServices.length
            ? otherServices.slice(0, 2).map((service) => `${service.name}: ${serviceStateLabels[service.state]}`).join(" · ")
            : "Keine Störungen gemeldet")
        : queryFallback(services),
      tone: serviceData?.services.some((service) => service.state === "error") ? "bad" : undefined,
    },
    {
      label: "Letzter Build",
      value: latestBuildAt ? formatDateTime(latestBuildAt) : metrics ? "Noch kein Build" : queryFallback(operationalMetrics),
      detail: metrics
        ? `${metrics.build.releaseCount} ${metrics.build.releaseCount === 1 ? "Build" : "Builds"} · ${formatBuildDuration(metrics.build.latestDurationMilliseconds)}`
        : queryFallback(operationalMetrics),
      to: "/settings#einstellungen:system",
    },
    {
      label: "Sicherung der Erweiterungen",
      value: backup ? (backup.available ? "Vorhanden" : "Keine Sicherung") : queryFallback(operationalMetrics),
      detail: backup
        ? backup.lastError ?? (metrics?.extensions.quarantined
          ? `${metrics.extensions.quarantined} ${metrics.extensions.quarantined === 1 ? "Erweiterung" : "Erweiterungen"} in Quarantäne`
          : "Alles gesichert")
        : queryFallback(operationalMetrics),
      tone: backup?.lastError ? "bad" : undefined,
      to: "/plugins",
    },
    {
      label: "Ungelesene Ereignisse",
      value: notificationData ? `${notificationData.unreadCount} ungelesen` : queryFallback(notifications),
      detail: notificationData
        ? latestNotification?.title ?? (notificationData.unreadCount ? "Neue Ereignisse vorhanden" : "Keine neuen Ereignisse")
        : queryFallback(notifications),
      tone: notificationData?.unacknowledgedErrorCount ? "bad" : undefined,
      to: latestNotification?.link
        ? stripAppBase(latestNotification.link)
        : "/settings#einstellungen:benachrichtigungen",
    },
  ];

  return (
    <Panel
      title="Wrapt im Überblick"
      icon={<WraptIcon className="h-4 w-4" />}
      name="wrapt-overview"
      className="dash-wrapt-panel"
    >
      {failedQueries.length ? (
        <div className="dash-notice is-warn" role="status">
          <WarningIcon className="h-4 w-4 shrink-0" />
          <span>
            Letzte Prüfung fehlgeschlagen: {failedQueries.map(({ label }) => label).join(", ")}.
            {hasStaleValues ? " Angezeigt werden die zuletzt geladenen Werte." : ""}
          </span>
          <button type="button" className="quiet-button min-h-11 shrink-0 px-4" onClick={retryFailedQueries}>
            <RefreshIcon className="h-4 w-4" /> Erneut versuchen
          </button>
        </div>
      ) : null}
      <ul className="dash-overview-list">
        {entries.map((entry) => <OverviewLink key={entry.label} entry={entry} />)}
      </ul>
    </Panel>
  );
}
