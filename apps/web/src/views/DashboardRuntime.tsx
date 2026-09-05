import { useMemo, useState } from "react";
import { useMutation, type UseQueryResult } from "@tanstack/react-query";
import type {
  LocalPort,
  LocalPortsResponse,
  ProjectsResponse,
  TerminalSession,
  TerminalSessionsResponse,
} from "@wrapt/contracts";
import { CloseIcon, ExternalLinkIcon, TerminalIcon, TrashIcon } from "../components/icons";
import { Badge, StateDot } from "../components/primitives";
import { formatClockTime } from "../lib/format";
import { groupDashboardRuntime, type DashboardRuntimeGroup } from "../lib/dashboardRuntime";
import { apiClient } from "../lib/apiClient";
import { ConfirmDialog } from "../components/ModalDialog";
import { runWithViewTransition } from "../lib/viewTransition";
import { Panel, PanelError, PanelSkeleton, formatDashboardPath, queryMessage, statusTone } from "./DashboardPanels";

type Query<T> = UseQueryResult<T, Error>;

export const terminalKindLabels: Record<TerminalSession["kind"], string> = {
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

function terminalDotState(status: TerminalSession["status"]): string {
  if (status === "running") return "active";
  if (status === "starting") return "checking";
  if (status === "interrupted") return "unknown";
  if (status === "exited" || status === "closed") return "inactive";
  return "unknown";
}

/** Ein Bereich zeigt höchstens so viele Ports und Sessions, bevor er kürzt. */
const RUNTIME_ROW_LIMIT = 3;

function RuntimeGroup({
  group,
  onOpenPort,
  onCloseSession,
  onCloseGroup,
  onDismissSession,
}: {
  group: DashboardRuntimeGroup;
  onOpenPort: (port: LocalPort) => void;
  onCloseSession: (session: TerminalSession) => void;
  onCloseGroup: (group: DashboardRuntimeGroup) => void;
  onDismissSession: (sessionId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const ports = expanded ? group.ports : group.ports.slice(0, RUNTIME_ROW_LIMIT);
  const sessions = expanded ? group.sessions : group.sessions.slice(0, RUNTIME_ROW_LIMIT);
  const hidden = group.ports.length - ports.length + (group.sessions.length - sessions.length);

  return (
    <li className="dash-runtime-group">
      <header>
        <strong>{group.projectName}</strong>
        <span className="font-mono">{group.ports.length} Ports · {group.sessions.length} Sessions</span>
        {group.sessions.length > 0 ? (
          <button
            type="button"
            className="dash-runtime-action dash-runtime-group-delete"
            title="Alle Sessions dieses Projekts beenden und löschen"
            aria-label={`Alle Sessions von ${group.projectName} beenden und löschen`}
            onClick={() => onCloseGroup(group)}
          >
            <TrashIcon className="h-3 w-3" />
          </button>
        ) : null}
      </header>
      <ul>
        {ports.map((port) => (
          <li key={`port-${port.port}`}>
            <button type="button" onClick={() => onOpenPort(port)}>
              <span className={`dash-port-dot is-${port.protocol}`} aria-hidden />
              <span className="dash-runtime-main">
                <strong className="font-mono">:{port.port}</strong>
                <small className="font-mono">{port.process ?? "Lokaler Dienst"} · PID {port.pid ?? "?"}</small>
              </span>
              <ExternalLinkIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {sessions.map((session) => (
          <li key={`session-${session.id}`} className="is-static">
            <StateDot state={terminalDotState(session.status)} />
            <span className="dash-runtime-main">
              <strong>{terminalKindLabels[session.kind]}</strong>
              <small className="font-mono">{formatDashboardPath(session.cwd)} · PID {session.pid || "?"} · {session.connectedClients} verbunden</small>
            </span>
            {session.status === "exited" || session.status === "closed" ? (
              <>
                <button
                  type="button"
                  className="dash-runtime-action dash-runtime-delete"
                  title="Terminal endgültig löschen"
                  aria-label={`${terminalKindLabels[session.kind]} endgültig löschen`}
                  onClick={() => onCloseSession(session)}
                >
                  <TrashIcon className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="dash-runtime-action dash-runtime-dismiss"
                  title="Aus der Ansicht entfernen"
                  aria-label={`${terminalKindLabels[session.kind]} aus der Ansicht entfernen`}
                  onClick={() => onDismissSession(session.id)}
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="dash-runtime-action dash-runtime-delete"
                title="Terminal beenden und löschen"
                aria-label={`${terminalKindLabels[session.kind]} beenden und löschen`}
                onClick={() => onCloseSession(session)}
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            )}
            <Badge tone={statusTone(session.status)}>{terminalStatusLabels[session.status]}</Badge>
          </li>
        ))}
        {hidden > 0 || expanded ? (
          <li className="is-static dash-runtime-toggle">
            <button type="button" onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}>
              {expanded ? "Weniger anzeigen" : `${hidden} weitere Einträge`}
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
  const [dismissedSessionIds, setDismissedSessionIds] = useState<Set<string>>(() => new Set());
  const [sessionToClose, setSessionToClose] = useState<TerminalSession | null>(null);
  const [groupToClose, setGroupToClose] = useState<DashboardRuntimeGroup | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const pending = ports.isPending || sessions.isPending || projects.isPending;
  const error = ports.error ?? sessions.error ?? projects.error;
  const closeSession = useMutation({
    mutationFn: (session: TerminalSession) => apiClient.closeTerminalSession(session.id),
    onSuccess: () => {
      setActionError(null);
      void sessions.refetch();
    },
    onError: (mutationError: unknown) => {
      setActionError(queryMessage(mutationError, "Die Terminalsitzung konnte nicht gelöscht werden."));
    },
  });
  const closeGroup = useMutation({
    mutationFn: async (group: DashboardRuntimeGroup) => {
      const results = await Promise.allSettled(group.sessions.map((session) => apiClient.closeTerminalSession(session.id)));
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed > 0) throw new Error(`${failed} von ${results.length} Sessions konnten nicht gelöscht werden.`);
    },
    onSuccess: () => {
      setActionError(null);
      void sessions.refetch();
    },
    onError: (mutationError: unknown) => {
      setActionError(queryMessage(mutationError, "Die Sessions konnten nicht gelöscht werden."));
      void sessions.refetch();
    },
  });

  const dismissSession = (sessionId: string) => {
    setDismissedSessionIds((current) => {
      const next = new Set(current);
      next.add(sessionId);
      return next;
    });
  };

  const groups = useMemo(
    () => groupDashboardRuntime(
      ports.data?.ports ?? [],
      (sessions.data?.sessions ?? []).filter((session) => !dismissedSessionIds.has(session.id)),
      projects.data?.projects ?? [],
    ),
    [dismissedSessionIds, ports.data, sessions.data, projects.data],
  );
  const visibleGroups = expanded ? groups : groups.slice(0, 3);
  const portCount = groups.reduce((total, group) => total + group.ports.length, 0);
  const sessionCount = groups.reduce((total, group) => total + group.sessions.length, 0);

  return (
    <Panel
      title="Laufende Arbeit"
      subtitle={pending ? "Ports und Sessions werden gelesen" : `${portCount} offene Ports · ${sessionCount} Terminal-Sessions`}
      icon={<TerminalIcon className="h-4 w-4" />}
      name="runtime"
      className="is-span-7"
      meta={ports.data ? <span className="dash-meta-time">Portscan {formatClockTime(ports.data.scannedAt)}</span> : null}
    >
      {error ? (
        <PanelError message={queryMessage(error, "Laufzeitdaten konnten nicht geladen werden.")} />
      ) : pending ? (
        <PanelSkeleton label="Laufzeitdaten laden" rows={3} />
      ) : groups.length === 0 ? (
        <p className="dash-muted">Momentan läuft kein Projektprozess. Ports und Sessions erscheinen hier automatisch.</p>
      ) : (
        <>
          {actionError ? <PanelError message={actionError} /> : null}
          <ul className="dash-runtime-list">
            {visibleGroups.map((group) => (
              <RuntimeGroup
                key={group.key}
                group={group}
                onOpenPort={onOpenPort}
                onCloseSession={(session) => { setActionError(null); setSessionToClose(session); }}
                onCloseGroup={(groupToDelete) => { setActionError(null); setGroupToClose(groupToDelete); }}
                onDismissSession={dismissSession}
              />
            ))}
          </ul>
          {groups.length > 3 ? (
            <button type="button" className="dash-more" onClick={() => runWithViewTransition(() => setExpanded((value) => !value))}>
              {expanded ? "Weniger anzeigen" : `${groups.length - 3} weitere Bereiche anzeigen`}
            </button>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={sessionToClose !== null}
        title="Terminal beenden und löschen?"
        description={`${sessionToClose ? terminalKindLabels[sessionToClose.kind] : "Diese Terminalsitzung"} wird beendet und aus der Session-Liste entfernt.`}
        confirmLabel={closeSession.isPending ? "Wird gelöscht …" : "Beenden und löschen"}
        danger
        onConfirm={() => { if (sessionToClose) closeSession.mutate(sessionToClose); }}
        onClose={() => setSessionToClose(null)}
      />
      <ConfirmDialog
        open={groupToClose !== null}
        title="Alle Sessions löschen?"
        description={groupToClose ? `${groupToClose.sessions.length} ${groupToClose.sessions.length === 1 ? "Session" : "Sessions"} von ${groupToClose.projectName} werden beendet und aus der Session-Liste entfernt.` : "Alle Sessions werden beendet."}
        confirmLabel={closeGroup.isPending ? "Wird gelöscht …" : "Alle beenden und löschen"}
        danger
        onConfirm={() => { if (groupToClose) closeGroup.mutate(groupToClose); }}
        onClose={() => setGroupToClose(null)}
      />
    </Panel>
  );
}
