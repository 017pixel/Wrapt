import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { DashboardSection, LocalPort } from "@wrapt/contracts";
import { InfoIcon, NetworkIcon } from "../components/icons";
import { formatRelativeTime } from "../lib/format";
import { wraptQueries } from "../lib/queryOptions";
import { getDashboardArtwork } from "../lib/dashboardArtwork";
import { allDashboardSections, isDashboardSectionVisible, useDashboardPreferences } from "../stores/dashboardPreferences";
import { useLayoutStore } from "../stores/layout";
import { useRouteActivity } from "../lib/routeActivity";
import { ContentDialog } from "../components/ModalDialog";
import { DashboardMobileSummary } from "./DashboardMobileSummary";
import { DashboardHeader, deriveSystemState, ServerDiagnosticsPanel } from "./DashboardSystemPanels";
import { VitalsBand } from "./DashboardVitals";
import { DashboardHistoryPanel } from "./DashboardHistoryPanel";
import { isDashboardDataStale } from "./DashboardDataState";
import { ServicesPanel, UsagePanel } from "./DashboardServicePanels";
import { AdvancedDashboardPanel, CopyButton } from "./DashboardTechnicalPanels";
import { RuntimePanel } from "./DashboardRuntime";
import { DashboardRecentProjects } from "./DashboardRecentProjects";
import { DashboardWraptPanel } from "./DashboardWraptPanel";
import "./dashboard-artwork.css";
import { CodePluginSurface } from "../extensions/code-surface";

export function Dashboard() {
  const navigate = useNavigate();
  const routeActive = useRouteActivity();
  const configQuery = useQuery({ ...wraptQueries.dashboardConfig(), enabled: routeActive });
  const config = configQuery.data;
  const hiddenSections = useDashboardPreferences((state) => state.hiddenSections);
  const sectionOrder = useDashboardPreferences((state) => state.sectionOrder);
  const artworkEnabled = useDashboardPreferences((state) => state.artworkEnabled);
  const artworkId = useDashboardPreferences((state) => state.artworkId);
  const artwork = getDashboardArtwork(artworkId);
  const selectProject = useLayoutStore((state) => state.selectProject);
  const visible = (section: DashboardSection) => isDashboardSectionVisible(config, hiddenSections, section);
  const orderFor = (...sections: DashboardSection[]) => (Math.min(
    ...sections.map((section) => {
      const index = sectionOrder.indexOf(section);
      return index < 0 ? allDashboardSections.length : index;
    }),
  ) + 1) * 10;
  const refresh = config?.refresh;

  const serverVisible = visible("server");
  const metricsVisible = visible("metrics");
  const wraptVisible = visible("wrapt");
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
  const services = useQuery({ ...wraptQueries.services(refresh?.servicesMilliseconds), enabled: routeActive && (servicesVisible || wraptVisible) });
  const projects = useQuery({ ...wraptQueries.projects(), enabled: routeActive && (runtimeVisible || projectActivityVisible) });
  const ports = useQuery({ ...wraptQueries.localPorts(refresh?.localPortsMilliseconds), enabled: routeActive && runtimeVisible });
  const sessions = useQuery({ ...wraptQueries.terminalSessions(refresh?.terminalSessionsMilliseconds), enabled: routeActive && runtimeVisible });
  const health = useQuery({ ...wraptQueries.health(refresh?.healthMilliseconds), enabled: routeActive && wraptVisible });
  const updateStatus = useQuery({ ...wraptQueries.updateStatus(), refetchOnWindowFocus: true, enabled: routeActive && wraptVisible });
  const t3Channel = useQuery({ ...wraptQueries.t3Channel(), enabled: routeActive && wraptVisible });
  const hermesStatus = useQuery({ ...wraptQueries.hermesStatus(), enabled: routeActive && wraptVisible });
  const notifications = useQuery({ ...wraptQueries.notifications(), enabled: routeActive && wraptVisible });
  const usage = useQuery({ ...wraptQueries.usageDashboard("30d", refresh?.usageMilliseconds), enabled: routeActive && usageVisible });
  const commands = useQuery({ ...wraptQueries.commands(), enabled: routeActive && commandsVisible });
  const [selectedCommand, setSelectedCommand] = useState<{ name: string; description: string; command: string } | null>(null);

  const summaryStale = isDashboardDataStale(summary, refresh?.summaryMilliseconds);
  const readinessStale = isDashboardDataStale(readiness, refresh?.summaryMilliseconds);
  const metricsStale = isDashboardDataStale(metrics, refresh?.metricsMilliseconds);
  const diagnosticsStale = isDashboardDataStale(diagnostics, refresh?.operationalMetricsMilliseconds);
  const unavailableSources = [
    summary.isError && !summary.data ? "Serverdaten" : null,
    readiness.isError && !readiness.data ? "Bereitschaft" : null,
    metrics.isError && !metrics.data ? "Messwerte" : null,
    diagnostics.isError && !diagnostics.data ? "Diagnose" : null,
  ].filter((source): source is string => source !== null);
  const staleSources = [
    summaryStale ? "Serverdaten" : null,
    readinessStale ? "Bereitschaft" : null,
    metricsStale ? "Messwerte" : null,
    diagnosticsStale ? "Diagnose" : null,
  ].filter((source): source is string => source !== null);
  const systemState = deriveSystemState(
    summary.data,
    readiness.data,
    readiness.isError,
    metrics.data,
    diagnostics.data,
    {
      pending: summary.isPending || readiness.isPending || metrics.isPending,
      unavailable: unavailableSources,
      stale: staleSources,
    },
  );

  const openPort = (port: LocalPort) => {
    if (port.projectId) selectProject(port.projectId);
    navigate("/previews");
  };
  const visibleCount = allDashboardSections.filter(visible).length;
  const serverName = summary.data?.serverName ?? (summary.isPending ? "Servername wird geladen" : "Server");
  const liveLabel = metrics.data
    ? metricsStale
      ? `Veraltet · ${formatRelativeTime(metrics.data.lastUpdated)}`
      : `Aktualisiert ${formatRelativeTime(metrics.data.lastUpdated)}`
    : metrics.isError ? "Messwerte nicht verfügbar" : "Verbindung wird geprüft";

  return (
    <div
      className={`page-scroll dash-scroll ${artworkEnabled ? "dash-has-artwork" : ""}`}
      style={artworkEnabled ? { "--dashboard-artwork-image": `url("${artwork.background}")` } as CSSProperties : undefined}
    >
      <div className="page-frame dash">
        <DashboardHeader
          summary={summary}
          state={systemState}
          metrics={metrics}
          diagnosticsVisible={diagnosticsVisible}
          summaryStale={summaryStale}
          metricsStale={metricsStale}
        />
        <DashboardMobileSummary state={systemState} serverName={serverName} liveLabel={liveLabel} />
        {configQuery.isError ? (
          <div className="dash-notice is-warn" role="status">
            <InfoIcon className="h-4 w-4 shrink-0" />
            <span>Die Dashboard-Konfiguration ist nicht erreichbar. Es gelten die Standardwerte.</span>
          </div>
        ) : null}

        <VitalsBand
          metrics={metrics}
          showMetrics={metricsVisible}
          metricsStale={metricsStale}
        />

        <div className="dash-bento">
          <CodePluginSurface surface="dashboard" builtins={[
            { id: "wrapt.dashboard.section.server", surface: "dashboard", title: "Server", order: orderFor("server"), children: serverVisible ? <ServerDiagnosticsPanel summary={summary} metrics={metrics} summaryStale={summaryStale} metricsStale={metricsStale} /> : null },
            { id: "wrapt.dashboard.section.runtime", surface: "dashboard", title: "Laufende Arbeit", order: orderFor("runtime"), children: runtimeVisible ? <RuntimePanel ports={ports} sessions={sessions} projects={projects} onOpenPort={openPort} /> : null },
            { id: "wrapt.dashboard.section.wrapt", surface: "dashboard", title: "Wrapt", order: orderFor("wrapt"), children: wraptVisible ? (
              <DashboardWraptPanel
                health={health}
                updateStatus={updateStatus}
                t3Channel={t3Channel}
                hermesStatus={hermesStatus}
                services={services}
                operationalMetrics={diagnostics}
                notifications={notifications}
              />
            ) : null },
            { id: "wrapt.dashboard.section.projects", surface: "dashboard", title: "Zuletzt aktiv", order: orderFor("quickActions"), children: projectActivityVisible ? <DashboardRecentProjects projects={projects} /> : null },
            { id: "wrapt.dashboard.section.services", surface: "dashboard", title: "Dienste", order: orderFor("services"), children: servicesVisible ? <ServicesPanel services={services} /> : null },
            { id: "wrapt.dashboard.section.usage", surface: "dashboard", title: "Nutzung", order: orderFor("usage"), children: usageVisible ? <UsagePanel usage={usage} /> : null },
            { id: "wrapt.dashboard.section.history", surface: "dashboard", title: "Messverlauf", order: orderFor("metrics"), children: metricsVisible ? <DashboardHistoryPanel metrics={metrics} stale={metricsStale} /> : null },
            {
              id: "wrapt.dashboard.section.advanced",
              surface: "dashboard",
              title: "Diagnose und Befehle",
              order: orderFor("diagnostics", "commands"),
              children: diagnosticsVisible || commandsVisible ? (
                <div id="dashboard-diagnostics" className="dash-diagnostics-target">
                  <AdvancedDashboardPanel diagnosticsVisible={diagnosticsVisible} commandsVisible={commandsVisible} diagnostics={diagnostics} readiness={readiness} commands={commands} onSelect={setSelectedCommand} />
                </div>
              ) : null,
            },
          ]} />
        </div>

        {visibleCount === 0 ? (
          <div className="dash-empty">
            <NetworkIcon className="h-5 w-5" />
            <strong>Alle Bereiche ausgeblendet</strong>
            <span>In den Einstellungen lassen sich die Dashboard-Bereiche wieder einschalten.</span>
            <button type="button" className="quiet-button" data-prefetch-route="/settings" onClick={() => navigate("/settings#einstellungen:navigation")}>
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
