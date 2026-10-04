import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router";
import type { OrbitBoard, Project, PreviewDevServerState, PreviewRuntimeLogLevel, PreviewRuntimeServiceRole } from "@wrapt/contracts";
import {
  ActivityIcon, CopyIcon, DatabaseIcon, ExternalLinkIcon,
  MoreIcon, PlayIcon, RefreshIcon, ServerIcon, ServicesIcon, TerminalIcon, WarningIcon, WorkbenchIcon,
} from "../components/icons";
import { apiClient } from "../lib/apiClient";
import { writeClipboardText } from "../lib/clipboard";
import { openPreviewLiveWindow, openPreviewWindow } from "../lib/previewExternalOpen";
import { findOrbitPreviewNodeByTarget } from "../lib/orbitResourceLookup";
import { orbitPreviewSessionKey } from "../lib/previewWindow";
import { queueOrbitPayload } from "../lib/orbitPalette";
import { previewSlotUrl } from "../lib/previewTargets";
import { wraptQueries } from "../lib/queryOptions";
import { withPreviewSlotRecovery, type PreviewSlotRecoveryPhase } from "../lib/previewSlotRecovery";
import { useSidebarPreferences } from "../stores/sidebarPreferences";

import { PreviewTargetMenu } from "./PreviewTargetMenu";

type LogFilter = "all" | PreviewRuntimeLogLevel;
type DirectOpenMode = "tab" | "window";

export const stateLabels: Record<PreviewDevServerState, string> = {
  stopped: "Gestoppt", starting: "Startet", running: "Läuft", stopping: "Stoppt", failed: "Fehler", unknown: "Unbekannt",
};
const roleLabels: Record<PreviewRuntimeServiceRole, string> = {
  frontend: "Frontend", backend: "Backend", api: "API", database: "Datenbank", socket: "WebSocket", worker: "Worker", other: "Dienst",
};
const logFilterLabels: Record<LogFilter, string> = { all: "Alle", error: "Fehler", warning: "Warnungen", success: "Erfolg", info: "Info" };
const launchPhaseLabels: Record<PreviewSlotRecoveryPhase, string> = {
  launching: "Projektlaufzeit und Preview werden vorbereitet.",
  "resetting-slot": "Eine alte Preview-Origin wird im Browser sicher zurückgesetzt.",
  retrying: "Der freie Preview-Slot wird jetzt mit dem Projekt verbunden.",
};

function serviceIcon(role: PreviewRuntimeServiceRole) {
  if (role === "database") return <DatabaseIcon />;
  if (role === "worker" || role === "socket") return <ActivityIcon />;
  if (role === "frontend") return <ServerIcon />;
  return <ServicesIcon />;
}

function openPlaceholder(mode: DirectOpenMode, projectId: string): Window | null {
  if (mode === "tab") {
    const opened = window.open("about:blank", "_blank");
    if (opened) opened.opener = null;
    return opened;
  }
  const width = Math.max(640, Math.round(window.screen.availWidth || 1_280));
  const height = Math.max(480, Math.round(window.screen.availHeight || 800));
  const opened = window.open("about:blank", `preview-${projectId}-${Date.now()}`, `popup=yes,width=${width},height=${height},left=0,top=0`);
  if (opened) opened.opener = null;
  return opened;
}

export function PreviewHubProject({ project, routeActive, orbitBoards }: { project: Project; routeActive: boolean; orbitBoards: readonly OrbitBoard[] }) {
  const orbitEnabled = useSidebarPreferences((state) => !state.hiddenPages.has("workbench"));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = project.id;
  const statusQuery = useQuery({ ...wraptQueries.previewDevServer(projectId), enabled: routeActive });
  const logsQuery = useQuery({ ...wraptQueries.previewDevServerLogs(projectId), enabled: routeActive });
  const status = statusQuery.data;
  const mainPort = status?.mainPort ?? null;
  const previewParam = searchParams.get("preview");
  const requestedPreview = previewParam ? project.previews.find((preview) => preview.id === previewParam) : undefined;
  const fallbackPreview = previewParam === "" ? undefined : mainPort ? project.previews.find((preview) => preview.targetPort === mainPort) : undefined;
  const selectedPreview = requestedPreview ?? fallbackPreview;
  const externalUrl = selectedPreview?.targetPort === null ? selectedPreview.url : null;
  const targetPort = selectedPreview ? selectedPreview.targetPort : mainPort;
  const targetPath = selectedPreview?.path ?? "/";
  const hasTarget = Boolean(externalUrl || targetPort);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [copied, setCopied] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [launchPhase, setLaunchPhase] = useState<PreviewSlotRecoveryPhase | null>(null);
  const configuredPreviewApplied = useRef<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const selectedLogs = useMemo(() => {
    const services = logsQuery.data?.services ?? [];
    const chosen = serviceFilter === "all" ? services : services.filter((service) => service.serviceId === serviceFilter);
    return chosen.flatMap((service) => service.lines.map((line) => ({ ...line, serviceName: service.name })))
      .filter((line) => filter === "all" || line.level === filter);
  }, [filter, logsQuery.data?.services, serviceFilter]);

  useEffect(() => {
    const selectionKey = `${project.id}:${previewParam ?? "default"}`;
    if (!routeActive || !status || configuredPreviewApplied.current === selectionKey) return;
    configuredPreviewApplied.current = selectionKey;
    const selectedPort = requestedPreview?.targetPort;
    if (selectedPort && status.services.some((service) => service.port === selectedPort) && selectedPort !== status.mainPort) {
      void apiClient.savePreviewDevServerMainPort(project.id, selectedPort).then(() => {
        void queryClient.invalidateQueries({ queryKey: ["preview-dev-server", project.id] });
      });
    }
  }, [previewParam, project.id, queryClient, requestedPreview, routeActive, status]);

  useEffect(() => {
    const node = logRef.current;
    if (node && filter === "all") node.scrollTop = node.scrollHeight;
  }, [filter, selectedLogs]);
  useEffect(() => {
    if (serviceFilter !== "all" && !logsQuery.data?.services.some((service) => service.serviceId === serviceFilter)) setServiceFilter("all");
  }, [logsQuery.data?.services, serviceFilter]);

  const refresh = async () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["preview-dev-server", projectId] }),
    queryClient.invalidateQueries({ queryKey: ["preview-dev-server", projectId, "logs"] }),
    queryClient.invalidateQueries({ queryKey: ["local-ports"] }),
  ]);
  const processMutation = useMutation({
    mutationFn: async (action: "start" | "stop" | "restart") => {
      setActionError(null);
      if (action === "start") return apiClient.startPreviewDevServer(projectId);
      if (action === "stop") return apiClient.stopPreviewDevServer(projectId);
      return apiClient.restartPreviewDevServer(projectId);
    },
    onSuccess: async (nextStatus) => { queryClient.setQueryData(["preview-dev-server", projectId], nextStatus); await refresh(); },
    onError: (error) => setActionError(error instanceof Error ? error.message : "Die Aktion ist fehlgeschlagen."),
  });
  const savePort = useMutation({
    mutationFn: async (port: number) => apiClient.savePreviewDevServerMainPort(projectId, port),
    onSuccess: () => void refresh(),
    onError: (error) => setActionError(error instanceof Error ? error.message : "Der Hauptport konnte nicht gespeichert werden."),
  });

  // Eine gespeicherte Veröffentlichung ist nur gültig, solange der gewählte
  // Dienst wirklich läuft. Sonst würde ein toter Slot-Link geöffnet, statt die
  // Projektlaufzeit neu aufzubauen.
  const targetServiceRunning = targetPort !== null && targetPort !== undefined
    && status?.services.some((service) => service.port === targetPort && service.state === "running") === true;
  const existingPublicUrl = status?.mainPort === targetPort && targetServiceRunning ? status.publicUrl : null;

  const openDirect = async (mode: DirectOpenMode) => {
    setActionError(null);
    if (externalUrl) {
      if (!openPreviewWindow(externalUrl, projectId)) setActionError("Der externe Link konnte nicht geöffnet werden.");
      return;
    }
    if (!targetPort) return;
    const opened = openPlaceholder(mode, projectId);
    if (!opened) {
      setActionError(mode === "tab" ? "Der neue Tab wurde blockiert. Erlaube Popups für Wrapt." : "Das Browserfenster wurde blockiert. Erlaube Popups für Wrapt.");
      return;
    }
    try {
      const existingUrl = existingPublicUrl;
      const launch = existingUrl ? null : await withPreviewSlotRecovery(() => apiClient.launchPreviewRuntime(projectId), setLaunchPhase);
      const baseUrl = existingUrl ?? launch?.url;
      if (!baseUrl) throw new Error("Die Preview-URL wurde nicht bereitgestellt.");
      const url = selectedPreview ? previewSlotUrl(baseUrl, targetPath) : baseUrl;
      opened.location.replace(url);
      await refresh();
    } catch (error) {
      opened.close();
      setActionError(error instanceof Error ? error.message : "Die Preview konnte nicht geöffnet werden.");
    } finally { setLaunchPhase(null); }
  };

  const copyDirectUrl = async () => {
    setActionError(null);
    try {
      if (externalUrl) {
        await writeClipboardText(externalUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1_500);
        return;
      }
      if (!targetPort) return;
      const existingUrl = existingPublicUrl;
      const launch = existingUrl ? null : await withPreviewSlotRecovery(() => apiClient.launchPreviewRuntime(projectId), setLaunchPhase);
      const baseUrl = existingUrl ?? launch?.url;
      if (!baseUrl) throw new Error("Die Preview-URL wurde nicht bereitgestellt.");
      const url = selectedPreview ? previewSlotUrl(baseUrl, targetPath) : baseUrl;
      await writeClipboardText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
      await refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Die Preview-URL konnte nicht kopiert werden.");
    } finally { setLaunchPhase(null); }
  };

  const matchingNode = targetPort ? findOrbitPreviewNodeByTarget(orbitBoards, projectId, targetPort, targetPath) : null;
  const storageProfileId = matchingNode?.node.previewStorageProfileId ?? null;
  const isolate = matchingNode?.node.previewIsolation ?? false;
  const slotId = matchingNode?.node.previewSlotId ?? null;
  const openInOrbit = () => {
    if (!targetPort || externalUrl) return;
    queueOrbitPayload({
      type: "previewTarget", title: selectedPreview?.name ?? `${project.name} · Preview`, projectId,
      ...(selectedPreview?.id ? { previewId: selectedPreview.id } : {}), targetPort, previewPath: targetPath,
      previewStorageProfileId: storageProfileId, previewIsolation: isolate, previewSlotId: slotId,
    });
    navigate("/orbit");
  };
  const openPreviewTools = (mode: DirectOpenMode) => {
    if (!targetPort || externalUrl) return;
    const sessionKey = orbitPreviewSessionKey({ projectId, previewTarget: `${targetPort}${targetPath}`, storageProfileId });
    const opened = openPreviewLiveWindow({ projectId, port: targetPort, path: targetPath, title: selectedPreview?.name ?? project.name, mode, sessionKey, isolate, storageProfileId, requestedSlotId: slotId });
    if (!opened) setActionError(mode === "tab" ? "Der neue Tab wurde blockiert." : "Das Browserfenster wurde blockiert.");
  };

  const choosePreview = (previewId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (previewId === "__preview_hub_runtime__") next.set("preview", "");
      else next.set("preview", previewId);
      return next;
    }, { replace: true });
  };

  const errorMessage = actionError ?? (statusQuery.error instanceof Error ? statusQuery.error.message : null) ?? status?.message;
  const servicePorts = status?.services.filter((service) => service.port !== null) ?? [];
  const runningServices = status?.services.filter((service) => service.state === "running").length ?? 0;
  const sourceLabel = status?.profileSource === "configured" ? "preview.config.json" : "Automatisch erkannt";
  const processAction = processMutation.isPending ? processMutation.variables : null;
  const visibleState: PreviewDevServerState = processAction === "stop" ? "stopping" : processAction ? "starting" : (status?.state ?? "unknown");
  const runtimeSummary = visibleState === "starting"
    ? `${status?.services.length ?? 0} ${status?.services.length === 1 ? "Dienst wird" : "Dienste werden"} gestartet`
    : visibleState === "stopping" ? "Projektlaufzeit wird beendet"
      : status?.state === "running"
        ? `${runningServices} von ${status.services.length} Diensten aktiv${status.startedAt ? ` · seit ${new Date(status.startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}` : ""}`
        : `${sourceLabel} · ${status?.services.length ?? 0} Dienste`;
  const publicTargetUrl = externalUrl ?? (status?.publicUrl && targetPort === mainPort
    ? selectedPreview ? previewSlotUrl(status.publicUrl, targetPath) : status.publicUrl
    : null);
  const targetUrlLabel = publicTargetUrl ?? (launchPhase
    ? launchPhaseLabels[launchPhase]
    : targetPort ? `Port ${targetPort}${targetPath === "/" ? "" : targetPath} wird beim Öffnen über einen sicheren Slot veröffentlicht`
      : "Kein Browser-Ziel verfügbar");

  return <>
    <header className="preview-hub-command">
      <div className="preview-hub-server-state"><span className={`preview-hub-state is-${visibleState}`} role="status" aria-label={stateLabels[visibleState]} title={stateLabels[visibleState]}><i aria-hidden="true" />{visibleState === "running" ? null : stateLabels[visibleState]}</span><div><strong>{project.name}</strong><span>{runtimeSummary}</span></div></div>
      <div className="preview-hub-process-actions">
        {status?.state === "running" ? <button type="button" className="preview-hub-secondary preview-hub-restart" aria-label="Neu starten" title="Neu starten" disabled={processMutation.isPending || Boolean(launchPhase)} onClick={() => processMutation.mutate("restart")}><RefreshIcon /></button> : null}
        <button type="button" className={status?.state === "running" ? "preview-hub-stop" : "preview-hub-primary"} data-pending={processMutation.isPending} disabled={processMutation.isPending || Boolean(launchPhase) || statusQuery.isLoading || !status?.services.length} onClick={() => processMutation.mutate(status?.state === "running" ? "stop" : "start")}>
          {processMutation.isPending ? <ActivityIcon /> : status?.state === "running" ? null : <PlayIcon />}{processAction === "stop" ? "Wird gestoppt" : processAction ? "Wird gestartet" : status?.state === "running" ? "Alles stoppen" : "Alles starten"}
        </button>
      </div>
    </header>
    {errorMessage ? <div className="preview-hub-alert is-error"><WarningIcon /><span>{errorMessage}</span></div> : null}
    {launchPhase ? <div className="preview-hub-alert is-progress" role="status"><ActivityIcon /><span>{launchPhaseLabels[launchPhase]}</span></div> : null}
    {status?.warnings.map((warning) => <div className="preview-hub-alert is-warning" key={warning}><WarningIcon /><span>{warning}</span></div>)}
    <div className="preview-hub-grid">
      <div className="preview-hub-overview">
        <section className="preview-hub-runtime">
          <div className="preview-hub-services">
            {status?.services.map((service) => <article className="preview-hub-service" key={service.id} data-state={service.state}>
              <div className="preview-hub-service-icon">{serviceIcon(service.role)}</div><div className="preview-hub-service-main">
                <div><strong>{service.name}</strong>{service.name.toLocaleLowerCase("de-DE") !== roleLabels[service.role].toLocaleLowerCase("de-DE") ? <span>{roleLabels[service.role]}</span> : null}</div>
                <code title={service.command}>{service.command}</code>{service.frameworkHints.length ? <small>{service.frameworkHints.join(" · ")}</small> : null}
              </div><div className="preview-hub-service-status">{service.state !== "running" ? <span className={`preview-hub-state is-${service.state}`}><i />{stateLabels[service.state]}</span> : null}{service.port ? <code>:{service.port}</code> : <span>Kein Port</span>}</div>
            </article>)}
            {!statusQuery.isLoading && !status?.services.length ? <div className="preview-hub-services-empty"><WarningIcon /><strong>Keine startbare Projektlaufzeit erkannt</strong><span>Lege bei Bedarf eine preview.config.json im Projekt an.</span></div> : null}
          </div>
        </section>
        <section className="preview-hub-target">
          <header><div><ExternalLinkIcon /><div><strong>Preview öffnen</strong></div></div></header>
          <div className="preview-hub-target-body">
            <div className="preview-hub-port-field">
              <span>Preview-Ziel</span>
              <PreviewTargetMenu label="Preview-Ziel auswählen" value={selectedPreview?.id ?? "__preview_hub_runtime__"} onChange={choosePreview}
                options={[{ value: "__preview_hub_runtime__", label: `Projektlaufzeit-Hauptziel${mainPort ? ` · ${mainPort}` : ""}` },
                  ...project.previews.map((preview) => ({ value: preview.id, label: `${preview.name} · ${preview.targetPort ?? preview.url ?? "Kein Ziel"}${preview.targetPort ? preview.path : ""}` }))]} />
            </div>
            <div className="preview-hub-port-field">
              <span>Hauptziel</span>
              <PreviewTargetMenu label="Hauptport auswählen" value={String(mainPort ?? "")} disabled={!servicePorts.length} placeholder="Ziel wählen"
                onChange={(value) => { if (!savePort.isPending) savePort.mutate(Number(value)); }}
                options={servicePorts.map((service) => ({ value: String(service.port), label: `${service.port} · ${service.name}${service.name.toLocaleLowerCase("de-DE") === roleLabels[service.role].toLocaleLowerCase("de-DE") ? "" : ` (${roleLabels[service.role]})`}` }))} />
            </div>
            <div className="preview-hub-urlbar"><code title={publicTargetUrl ?? undefined}>{targetUrlLabel}</code><button type="button" disabled={!hasTarget || Boolean(launchPhase)} aria-label="Preview-URL kopieren" onClick={() => void copyDirectUrl()}><CopyIcon /><span>{copied ? "Kopiert" : "URL kopieren"}</span></button></div>
            <div className="preview-hub-launchbar">
              <button type="button" className="preview-hub-primary" disabled={!hasTarget || Boolean(launchPhase) || processMutation.isPending} onClick={() => void openDirect("tab")}><ExternalLinkIcon />{launchPhase ? "Preview wird vorbereitet" : "Im neuen Tab öffnen"}</button>
              <details className="preview-hub-more"><summary aria-label="Weitere Optionen"><MoreIcon /></summary><div>
                <button type="button" disabled={!hasTarget || Boolean(launchPhase)} onClick={() => void openDirect("window")}><ExternalLinkIcon /><span><strong>Im neuen Fenster</strong><small>{externalUrl ? "Externe Adresse direkt öffnen" : "Nur das laufende Projekt"}</small></span></button>
                {externalUrl ? <p role="note">Externe URLs werden direkt im Browser geöffnet.</p> : <>
                  {orbitEnabled ? <button type="button" disabled={!targetPort} onClick={openInOrbit}><WorkbenchIcon /><span><strong>Im Orbit öffnen</strong><small>Als Preview-Fläche öffnen</small></span></button> : null}
                  <button type="button" disabled={!targetPort} onClick={() => openPreviewTools("tab")}><ServerIcon /><span><strong>Preview-Werkzeuge im Tab</strong><small>Mit Geräte- und Größenwahl</small></span></button>
                  <button type="button" disabled={!targetPort} onClick={() => openPreviewTools("window")}><ServerIcon /><span><strong>Preview-Werkzeuge im Fenster</strong><small>Mit Geräte- und Größenwahl</small></span></button>
                </>}
              </div></details>
            </div>
          </div>
        </section>
      </div>
      <section className="preview-hub-logs">
        <header><div><TerminalIcon /><div><strong>Dev-Server-Logs</strong><span>{logsQuery.data?.capturedAt ? `Aktualisiert ${new Date(logsQuery.data.capturedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Noch keine Ausgabe"}</span></div></div><div className="preview-hub-log-counts">{logsQuery.data?.errorCount ? <span className="is-error">{logsQuery.data.errorCount} Fehler</span> : null}{logsQuery.data?.warningCount ? <span className="is-warning">{logsQuery.data.warningCount} {logsQuery.data.warningCount === 1 ? "Warnung" : "Warnungen"}</span> : null}{logsQuery.data?.truncated ? <span>Gekürzt</span> : null}</div></header>
        <div className="preview-hub-log-services" role="tablist" aria-label="Dienst auswählen"><button type="button" className={serviceFilter === "all" ? "is-active" : ""} onClick={() => setServiceFilter("all")}>Alle Dienste</button>{logsQuery.data?.services.map((service) => <button type="button" key={service.serviceId} className={serviceFilter === service.serviceId ? "is-active" : ""} onClick={() => setServiceFilter(service.serviceId)}>{service.name}<span>{service.port ? `:${service.port}` : "ohne Port"}</span></button>)}</div>
        <div className="preview-hub-log-toolbar"><nav aria-label="Log-Level filtern">{(["all", "error", "warning", "success", "info"] as const).map((value) => <button type="button" key={value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{logFilterLabels[value]}</button>)}</nav><button type="button" className="preview-hub-copy-logs" disabled={!selectedLogs.length} onClick={() => void writeClipboardText(selectedLogs.map((line) => `[${line.serviceName}] ${line.text}`).join("\n"))}><CopyIcon />Logs kopieren</button></div>
        <div className="preview-hub-log-output" ref={logRef} role="log" aria-live="polite">{selectedLogs.map((line, index) => <div className="preview-hub-log-line" data-level={line.level} key={`${line.serviceId}-${index}-${line.text}`}><span>{line.serviceName}</span><code>{line.text}</code></div>)}{!selectedLogs.length ? <div className="preview-hub-log-empty">{visibleState === "starting" ? <><ActivityIcon /><strong>Dev-Server werden gestartet</strong><span>Die erste Ausgabe erscheint automatisch, sobald der Prozess antwortet.</span></> : status?.state === "running" ? <><ActivityIcon /><strong>Dev-Server läuft</strong><span>Der gewählte Dienst oder Filter hat momentan keine passenden Einträge.</span></> : <><TerminalIcon /><strong>Die Projektlaufzeit ist nicht aktiv</strong><span>Nach dem Start erscheinen die Ausgaben hier getrennt nach Dienst und Log-Level.</span></>}</div> : null}</div>
      </section>
    </div>
  </>;
}
