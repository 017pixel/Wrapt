import { useId, useMemo, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  LocalPort,
  LocalPortsResponse,
  ProjectsResponse,
  TerminalSession,
  TerminalSessionsResponse,
} from "@wrapt/contracts";
import { Link } from "react-router";
import { ChevronRightIcon, TerminalIcon } from "../components/icons";
import { formatClockTime } from "../lib/format";
import { groupDashboardRuntime, type DashboardRuntimeGroup } from "../lib/dashboardRuntime";
import { runWithViewTransition } from "../lib/viewTransition";
import { Panel, PanelError, PanelSkeleton, formatDashboardPath, queryMessage } from "./DashboardPanels";
import "./dashboard-overview-panels.css";

type Query<T> = UseQueryResult<T, Error>;

const terminalKindLabels: Record<TerminalSession["kind"], string> = {
  shell: "Shell",
  codex: "Codex",
  opencode: "OpenCode",
  claude: "Claude Code",
};

const terminalStatusLabels: Record<TerminalSession["status"], string> = {
  starting: "Startet",
  running: "Läuft",
  exited: "Beendet",
  interrupted: "Unterbrochen",
  closed: "Geschlossen",
};

/** Ein Bereich zeigt höchstens so viele Ports und Sessions, bevor er kürzt. */
const RUNTIME_ROW_LIMIT = 3;

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function RuntimeGroup({
  group,
  onOpenPort,
  portsKnown,
  sessionsKnown,
}: {
  group: DashboardRuntimeGroup;
  onOpenPort: (port: LocalPort) => void;
  portsKnown: boolean;
  sessionsKnown: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const ports = expanded ? group.ports : group.ports.slice(0, RUNTIME_ROW_LIMIT);
  const sessions = expanded ? group.sessions : group.sessions.slice(0, RUNTIME_ROW_LIMIT);
  const hidden = group.ports.length - ports.length + (group.sessions.length - sessions.length);
  const counts = [
    portsKnown ? countLabel(group.ports.length, "Port", "Ports") : null,
    sessionsKnown ? countLabel(group.sessions.length, "Session", "Sessions") : null,
  ].filter((entry): entry is string => entry !== null);

  return (
    <li className="dash-runtime-group">
      <header>
        <strong>{group.projectName}</strong>
        {counts.length ? <span className="font-mono">{counts.join(" · ")}</span> : null}
      </header>
      <ul id={listId}>
        {ports.map((port) => (
          <li key={`port-${port.port}`}>
            <Link
              to="/previews"
              className="dash-runtime-row-link"
              aria-label={`Offener Port ${port.port}, ${port.protocol}, ${port.process ?? "Lokaler Dienst"}, PID ${port.pid ?? "unbekannt"} in Previews öffnen`}
              onClick={() => onOpenPort(port)}
            >
              <span className="dash-runtime-main">
                <strong className="font-mono">:{port.port}</strong>
                <small className="font-mono">{port.process ?? "Lokaler Dienst"} · PID {port.pid ?? "?"}</small>
              </span>
              <span className="dash-runtime-row-state">{port.protocol}</span>
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
        {sessions.map((session) => (
          <li key={`session-${session.id}`}>
            <Link
              to={`/terminal?session=${encodeURIComponent(session.id)}`}
              className="dash-runtime-row-link"
              aria-label={`${terminalKindLabels[session.kind]} im Terminal öffnen, Status ${terminalStatusLabels[session.status]}, ${formatDashboardPath(session.cwd)}, PID ${session.pid || "unbekannt"}, ${session.connectedClients} verbunden`}
            >
              <span className="dash-runtime-main">
                <strong>{terminalKindLabels[session.kind]}</strong>
                <small className="font-mono">{formatDashboardPath(session.cwd)} · PID {session.pid || "?"} · {session.connectedClients} verbunden</small>
              </span>
              <span className="dash-runtime-row-state">{terminalStatusLabels[session.status]}</span>
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </Link>
          </li>
        ))}
        {hidden > 0 || expanded ? (
          <li className="is-static dash-runtime-toggle">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}
            >
              {expanded ? "Weniger anzeigen" : hidden === 1 ? "1 weiterer Eintrag" : `${hidden} weitere Einträge`}
            </button>
          </li>
        ) : null}
      </ul>
    </li>
  );
}

export function RuntimePanel({
  ports,
  sessions,
  projects,
  onOpenPort,
}: {
  ports: Query<LocalPortsResponse>;
  sessions: Query<TerminalSessionsResponse>;
  projects: Query<ProjectsResponse>;
  onOpenPort: (port: LocalPort) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const sources = [
    { label: "Ports", query: ports },
    { label: "Terminal-Sessions", query: sessions },
    { label: "Projekte", query: projects },
  ];
  const failedSources = sources.filter(({ query }) => query.isError);
  const pendingRuntime = (ports.isPending && !ports.data) || (sessions.isPending && !sessions.data);
  const hasRuntimeData = Boolean(ports.data || sessions.data);
  const groups = useMemo(
    () => groupDashboardRuntime(
      ports.data?.ports ?? [],
      sessions.data?.sessions ?? [],
      projects.data?.projects ?? [],
    ),
    [ports.data, sessions.data, projects.data],
  );
  const visibleGroups = expanded ? groups : groups.slice(0, 3);
  const portCount = groups.reduce((total, group) => total + group.ports.length, 0);
  const sessionCount = groups.reduce((total, group) => total + group.sessions.length, 0);
  const loadedCounts = [
    ports.data ? countLabel(portCount, "offener Port", "offene Ports") : null,
    sessions.data ? countLabel(sessionCount, "Terminal-Session", "Terminal-Sessions") : null,
  ].filter((entry): entry is string => entry !== null);
  const subtitle = loadedCounts.length
    ? loadedCounts.join(" · ")
    : failedSources.length
      ? `${failedSources.map(({ label }) => label).join(", ")} nicht verfügbar`
      : "Laufzeitdaten werden gelesen";
  const emptyLabel = ports.data && sessions.data
    ? "Keine Ports oder Terminal-Sessions."
    : ports.data
      ? "Keine offenen Ports."
      : sessions.data
        ? "Keine Terminal-Sessions."
        : null;
  const hiddenGroups = groups.length - 3;

  return (
    <Panel
      title="Laufende Arbeit"
      subtitle={subtitle}
      icon={<TerminalIcon className="h-4 w-4" />}
      name="runtime"
      className="dash-runtime-panel"
      meta={
        <div className="dash-runtime-meta">
          {ports.data ? <span className="dash-meta-time">Portscan {formatClockTime(ports.data.scannedAt)}</span> : null}
          <Link className="dash-link" to="/previews">Previews</Link>
          <Link className="dash-link" to="/terminal">Terminals</Link>
        </div>
      }
    >
      <div className="dash-runtime-content">
        {failedSources.length ? (
          <div className="dash-server-notices">
            {failedSources.map(({ label, query }) => (
              <PanelError
                key={label}
                message={`${label}: ${queryMessage(query.error, "Daten konnten nicht geladen werden.")}${query.data ? " Angezeigt werden die zuletzt geladenen Werte." : ""}`}
                onRetry={() => void query.refetch()}
              />
            ))}
          </div>
        ) : null}
        {!hasRuntimeData && pendingRuntime ? <PanelSkeleton label="Laufzeitdaten laden" rows={3} /> : null}
        {hasRuntimeData ? (
          groups.length ? (
            <>
              <ul id={listId} className="dash-runtime-list">
                {visibleGroups.map((group) => (
                  <RuntimeGroup
                    key={group.key}
                    group={group}
                    onOpenPort={onOpenPort}
                    portsKnown={Boolean(ports.data)}
                    sessionsKnown={Boolean(sessions.data)}
                  />
                ))}
              </ul>
              {hiddenGroups > 0 ? (
                <button
                  type="button"
                  className="dash-more"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}
                >
                  {expanded
                    ? "Weniger anzeigen"
                    : hiddenGroups === 1
                      ? "1 weiterer Bereich anzeigen"
                      : `${hiddenGroups} weitere Bereiche anzeigen`}
                </button>
              ) : null}
            </>
          ) : emptyLabel ? (
            <p className="dash-muted">{emptyLabel}</p>
          ) : null
        ) : null}
      </div>
    </Panel>
  );
}
