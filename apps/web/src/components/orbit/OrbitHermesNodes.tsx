import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { type HermesCronJob, type HermesResult, type HermesStatus, type HermesTask } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { useRouteActivity } from "../../lib/routeActivity";
import { hermesSourceLabels } from "../../lib/hermesPresentation";
import { useActiveOrbitNode, NodeChrome } from "./OrbitNodeChrome";

export function hermesSessionRoute(sessionId: string): string {
  const path = `/chat?resume=${encodeURIComponent(sessionId)}`;
  return `/hermes-agent?path=${encodeURIComponent(path)}`;
}

export function hermesDate(value: string | null): string {
  if (!value) return "–";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(parsed);
}

export function HermesNodeState({ loading, error, empty = "Keine Daten verfügbar." }: { loading: boolean; error: boolean; empty?: string }) {
  if (loading) return <p className="orbit-hermes-state">Hermes-Daten werden geladen…</p>;
  if (error) return <p className="orbit-hermes-state is-error">Hermes ist momentan nicht erreichbar. Diagnose öffnen.</p>;
  return <p className="orbit-hermes-state">{empty}</p>;
}

export function HermesStatusNode({ id, selected }: { id: string; selected: boolean }) {
  const routeActive = useRouteActivity();
  const query = useQuery({ ...wraptQueries.hermesStatus(), enabled: routeActive });
  const status = query.data as HermesStatus | undefined;
  return <NodeChrome id={id} title="Hermes Status" selected={selected}>
    {status ? <div className="orbit-hermes-status nodrag">
      <div className="orbit-hermes-status-head"><span className={`orbit-hermes-state-dot ${status.reachable ? "is-ok" : "is-error"}`} /><strong>{status.reachable ? "Erreichbar" : "Nicht erreichbar"}</strong><small>{hermesDate(status.checkedAt)}</small></div>
      <div className="orbit-hermes-facts">
        <div><span>Version</span><strong>{status.version ?? "Unbekannt"}</strong></div>
        <div><span>Anbieter</span><strong>{status.provider ?? "Nicht gesetzt"}</strong></div>
        <div><span>Modell</span><strong>{status.model ?? "Nicht gesetzt"}</strong></div>
        <div><span>Dashboard</span><strong>{status.dashboard.state}</strong></div>
        <div><span>Gateway</span><strong>{status.gateway.state}</strong></div>
        <div><span>Telegram</span><strong>{status.gateway.telegramConnected === null ? "Unbekannt" : status.gateway.telegramConnected ? "Verbunden" : "Getrennt"}</strong></div>
      </div>
      {status.update.available || status.update.pending ? <p className="orbit-hermes-state is-warning">Update {status.update.pending ? "verschoben" : "verfügbar"}.</p> : null}
    </div> : <HermesNodeState loading={query.isLoading} error={query.isError} />}
  </NodeChrome>;
}

export function HermesTasksNode({ id, selected }: { id: string; selected: boolean }) {
  const routeActive = useRouteActivity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const node = useActiveOrbitNode(id)!;
  const query = useQuery({ ...wraptQueries.hermesTasks(), enabled: routeActive });
  const [cancelling, setCancelling] = useState<string | null>(null);
  const tasks = (query.data?.tasks ?? []).filter((task) => node.hermesSourceFilter === "all" || task.source === node.hermesSourceFilter);
  const cancel = async (task: HermesTask) => {
    setCancelling(task.sessionId);
    try {
      await apiClient.cancelHermesTask(task.sessionId);
      await queryClient.invalidateQueries({ queryKey: wraptQueries.hermesTasks().queryKey });
    } finally {
      setCancelling(null);
    }
  };
  return <NodeChrome id={id} title="Hermes Aufgaben" selected={selected}>
    {tasks.length ? <div className="orbit-hermes-list nodrag">
      {tasks.map((task) => <article className="orbit-hermes-list-item" key={task.id}>
        <div className="orbit-hermes-list-main"><strong>{task.title}</strong><small>{hermesSourceLabels[task.source]} · {task.model ?? "Modell unbekannt"}</small></div>
        <div className="orbit-hermes-list-meta"><span>{task.runtimeSeconds}s</span><button type="button" className="orbit-hermes-action is-danger" disabled={!task.cancellable || cancelling === task.sessionId} onClick={() => void cancel(task)}>{cancelling === task.sessionId ? "Stoppt…" : "Stoppen"}</button><button type="button" className="orbit-hermes-action" onClick={() => navigate(hermesSessionRoute(task.sessionId))}>Öffnen</button></div>
      </article>)}
    </div> : <HermesNodeState loading={query.isLoading} error={query.isError} empty="Keine laufenden Aufgaben." />}
  </NodeChrome>;
}

export function HermesCronNode({ id, selected }: { id: string; selected: boolean }) {
  const routeActive = useRouteActivity();
  const navigate = useNavigate();
  const query = useQuery({ ...wraptQueries.hermesCron(), enabled: routeActive });
  const jobs = query.data?.jobs ?? [];
  const openJob = (job: HermesCronJob) => navigate(`/hermes-agent?path=${encodeURIComponent(job.adminPath)}`);
  return <NodeChrome id={id} title="Hermes Automatisierungen" selected={selected}>
    {jobs.length ? <div className="orbit-hermes-list nodrag">{jobs.map((job) => <article className="orbit-hermes-list-item" key={job.id}>
      <div className="orbit-hermes-list-main"><strong>{job.name}</strong><small>{job.schedule || "Kein Zeitplan"} · {job.enabled ? "Aktiv" : "Pausiert"}</small></div>
      <div className="orbit-hermes-list-meta"><span className={`orbit-hermes-status-text is-${job.lastStatus}`}>{job.lastStatus}</span><button type="button" className="orbit-hermes-action" onClick={() => openJob(job)}>Verwalten</button></div>
    </article>)}</div> : <HermesNodeState loading={query.isLoading} error={query.isError} empty="Keine Cronjobs gefunden." />}
  </NodeChrome>;
}

export function HermesResultsNode({ id, selected }: { id: string; selected: boolean }) {
  const routeActive = useRouteActivity();
  const navigate = useNavigate();
  const node = useActiveOrbitNode(id)!;
  const sourceFilter = node.hermesSourceFilter === "all" ? undefined : node.hermesSourceFilter;
  const statusFilter = node.hermesStatusFilter === "all" ? undefined : node.hermesStatusFilter;
  const query = useQuery({ ...wraptQueries.hermesResults(sourceFilter, statusFilter), enabled: routeActive });
  const results = query.data?.results ?? [];
  return <NodeChrome id={id} title="Hermes Ergebnisse" selected={selected}>
    {results.length ? <div className="orbit-hermes-list nodrag">{results.map((result: HermesResult) => <article className="orbit-hermes-list-item" key={result.id}>
      <div className="orbit-hermes-list-main"><strong>{result.title}</strong><small>{hermesSourceLabels[result.source]} · {hermesDate(result.finishedAt)}</small><p>{result.preview}</p></div>
      <div className="orbit-hermes-list-meta"><span className={`orbit-hermes-status-text is-${result.status}`}>{result.status === "success" ? "Erfolg" : "Fehler"}</span><button type="button" className="orbit-hermes-action" onClick={() => navigate(hermesSessionRoute(result.sessionId))}>Öffnen</button></div>
    </article>)}</div> : <HermesNodeState loading={query.isLoading} error={query.isError} empty="Noch keine Ergebnisse." />}
  </NodeChrome>;
}
