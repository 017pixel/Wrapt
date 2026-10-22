import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { DashboardSection, LocalPort } from "@wrapt/contracts";
import { InfoIcon, NetworkIcon } from "../components/icons";
import { formatRelativeTime } from "../lib/format";
import { wraptQueries } from "../lib/queryOptions";
import { getDashboardArtwork } from "../lib/dashboardArtwork";
import { useDashboardPreferences, isDashboardSectionVisible } from "../stores/dashboardPreferences";
import { useLayoutStore } from "../stores/layout";
import { useRouteActivity } from "../lib/routeActivity";
import { ContentDialog } from "../components/ModalDialog";
import { DashboardMobileSummary } from "./DashboardMobileSummary";
import { DashboardHeader, deriveSystemState, VitalsBand, ServerDiagnosticsPanel } from "./DashboardSystemPanels";
import { ServicesPanel, UsagePanel } from "./DashboardServicePanels";
import { AdvancedDashboardPanel, CopyButton } from "./DashboardTechnicalPanels";
import { RuntimePanel } from "./DashboardRuntime";
import { DashboardRecentProjects } from "./DashboardRecentProjects";
import "./dashboard-artwork.css";
import { CodePluginSurface } from "../extensions/code-surface";

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
      className={`page-scroll dash-scroll ${artworkEnabled ? "dash-has-artwork" : ""}`}
      style={artworkEnabled ? { "--dashboard-artwork-image": `url("${artwork.background}")` } as CSSProperties : undefined}
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
          <CodePluginSurface surface="dashboard" builtins={[
            { id: "wrapt.dashboard.section.server", surface: "dashboard", title: "Server", order: 10, children: serverVisible ? <ServerDiagnosticsPanel summary={summary} metrics={metrics} /> : null },
            { id: "wrapt.dashboard.section.projects", surface: "dashboard", title: "Projekte", order: 20, children: projectActivityVisible ? <DashboardRecentProjects projects={projects} /> : null },
            { id: "wrapt.dashboard.section.services", surface: "dashboard", title: "Dienste", order: 30, children: servicesVisible ? <ServicesPanel services={services} /> : null },
            { id: "wrapt.dashboard.section.runtime", surface: "dashboard", title: "Laufzeiten", order: 40, children: runtimeVisible ? <RuntimePanel ports={ports} sessions={sessions} projects={projects} onOpenPort={openPort} /> : null },
            { id: "wrapt.dashboard.section.usage", surface: "dashboard", title: "Nutzung", order: 50, children: usageVisible ? <UsagePanel usage={usage} /> : null },
            { id: "wrapt.dashboard.section.advanced", surface: "dashboard", title: "Diagnose und Befehle", order: 60, children: <AdvancedDashboardPanel diagnosticsVisible={diagnosticsVisible} commandsVisible={commandsVisible} diagnostics={diagnostics} readiness={readiness} commands={commands} onSelect={setSelectedCommand} /> },
          ]} />
        </div>

        {visibleCount === 0 ? (
          <div className="dash-empty">
            <NetworkIcon className="h-5 w-5" />
            <strong>Alle Bereiche ausgeblendet</strong>
            <span>In den Einstellungen lassen sich die Dashboard-Bereiche wieder einschalten.</span>
            <button type="button" className="quiet-button" data-prefetch-route="/settings" onClick={() => navigate("/settings")}>
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
