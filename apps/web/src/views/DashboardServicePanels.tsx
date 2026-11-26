import { Link } from "react-router";
import type { ServicesResponse, UsageDashboardResponse } from "@wrapt/contracts";
import { ServicesIcon, ExternalLinkIcon, NutzungIcon } from "../components/icons";
import { Meter, loadTone } from "../components/charts";
import { formatClockTime, formatRelativeTime } from "../lib/format";
import { Panel, PanelError, PanelSkeleton, Facts, queryMessage, type DashboardQuery as Query } from "./DashboardPanels";
import { integer, money, serverModeLabel, formatDateTime } from "./dashboardMetrics";
import "./dashboard-overview-panels.css";

const serviceStateLabels: Record<ServicesResponse["services"][number]["state"], string> = {
  active: "Aktiv",
  inactive: "Inaktiv",
  error: "Fehler",
  unknown: "Unbekannt",
  checking: "Prüfung läuft",
};

const serviceStateTones: Record<ServicesResponse["services"][number]["state"], "default" | "warn" | "bad"> = {
  active: "default",
  inactive: "default",
  error: "bad",
  unknown: "warn",
  checking: "warn",
};

export function ServicesPanel({ services }: { services: Query<ServicesResponse> }) {
  const data = services.data;
  const online = data?.services.filter((service) => service.state === "active").length ?? 0;
  const retry = () => void services.refetch();
  return (
    <Panel
      title="Dienste"
      subtitle={data ? `${online} von ${data.services.length} aktiv` : "Konfigurierte Dienste"}
      icon={<ServicesIcon className="h-4 w-4" />}
      name="services"
      className="dash-services-panel"
    >
      {services.isError && !data ? (
        <PanelError
          message={queryMessage(services.error, "Dienste konnten nicht geladen werden.")}
          error={services.error}
          onRetry={retry}
        />
      ) : !data ? (
        <PanelSkeleton label="Dienste laden" rows={3} />
      ) : (
        <>
          {services.isError ? (
            <PanelError
              message={`Aktualisierung fehlgeschlagen: ${queryMessage(services.error, "Dienste konnten nicht aktualisiert werden.")} Angezeigt werden die zuletzt geladenen Werte.`}
              onRetry={retry}
            />
          ) : null}
          {data.services.length === 0 ? (
            <p className="dash-muted">Keine Dienste konfiguriert.</p>
          ) : (
            <ul className="dash-service-list">
              {data.services.map((service) => (
                <li key={service.id}>
                  <div className="dash-service-copy">
                    <strong>{service.name}</strong>
                    <small>{serverModeLabel(service.mode)}{service.message ? ` · ${service.message}` : ""}</small>
                  </div>
                  <span className="dash-service-details">
                    <span className="dash-service-state" data-tone={serviceStateTones[service.state]}>
                      {serviceStateLabels[service.state]}
                    </span>
                    <small className="dash-service-check" title={formatDateTime(service.lastChecked)}>
                      Geprüft {formatClockTime(service.lastChecked)}
                    </small>
                  </span>
                  {service.publicUrl ? (
                    <a
                      href={service.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="dash-service-open"
                      aria-label={`${service.name} öffnen`}
                    >
                      <ExternalLinkIcon className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------- Nebenwerte */

export function UsagePanel({ usage }: { usage: Query<UsageDashboardResponse> }) {
  const data = usage.data;
  const retry = () => void usage.refetch();
  const windows = data
    ? data.live.providers
        .flatMap((provider) => provider.accounts.flatMap((account) => account.windows.map((window) => ({ provider, account, window }))))
        .sort((left, right) => {
          const remainingDifference = left.window.remainingPercent - right.window.remainingPercent;
          if (remainingDifference !== 0) return remainingDifference;
          const providerDifference = left.provider.providerName.localeCompare(right.provider.providerName, "de");
          if (providerDifference) return providerDifference;
          const leftAccount = left.account.email ?? left.account.label;
          const rightAccount = right.account.email ?? right.account.label;
          return leftAccount.localeCompare(rightAccount, "de") || left.window.id.localeCompare(right.window.id, "de");
        })
        .slice(0, 3)
    : [];

  return (
    <Panel
      title="Nutzung und Limits"
      subtitle={data ? `Datenstand ${formatRelativeTime(data.live.lastSuccessfulFetchAt ?? data.live.fetchedAt)}` : "Limits der verbundenen Konten"}
      icon={<NutzungIcon className="h-4 w-4" />}
      name="usage"
      meta={<Link className="dash-link" to="/usage">Alle Limits</Link>}
    >
      {usage.isError && !data ? (
        <PanelError
          message={queryMessage(usage.error, "Nutzungsdaten konnten nicht geladen werden.")}
          error={usage.error}
          onRetry={retry}
        />
      ) : !data ? (
        <PanelSkeleton label="Nutzung lädt" rows={3} />
      ) : (
        <>
          {usage.isError ? (
            <PanelError
              message={`Aktualisierung fehlgeschlagen: ${queryMessage(usage.error, "Nutzungsdaten konnten nicht aktualisiert werden.")} Angezeigt werden die zuletzt geladenen Werte.`}
              onRetry={retry}
            />
          ) : null}
          <Facts
            min="120px"
            items={[
              { label: "Tokens heute", value: integer.format(data.totals.todayTokens) },
              { label: "Tokens 30 Tage", value: integer.format(data.totals.totalTokens) },
              { label: "Kosten 30 Tage", value: money.format(data.totals.totalCost) },
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
