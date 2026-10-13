import { Link } from "react-router";
import type { ServicesResponse, UsageDashboardResponse } from "@wrapt/contracts";
import { ServicesIcon, ExternalLinkIcon, NutzungIcon } from "../components/icons";
import { Badge, StateDot } from "../components/primitives";
import { Meter, loadTone } from "../components/charts";
import { formatRelativeTime } from "../lib/format";
import { Panel, PanelError, PanelSkeleton, Facts, queryMessage, type DashboardQuery as Query } from "./DashboardPanels";
import { integer, money, serverModeLabel, formatDateTime } from "./dashboardMetrics";

export function ServicesPanel({ services }: { services: Query<ServicesResponse> }) {
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

export function UsagePanel({ usage }: { usage: Query<UsageDashboardResponse> }) {
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

