import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { PreviewDevServerState, PreviewDevServerStatus, Project } from "@wrapt/contracts";
import {
  ActivityIcon,
  ChevronDownIcon,
  CloseIcon,
  CopyIcon,
  FolderCodeIcon,
  MoreIcon,
  PlusIcon,
  PowerIcon,
  ServerIcon,
  ExternalLinkIcon,
} from "../components/icons";
import { apiClient } from "../lib/apiClient";
import { wraptQueries } from "../lib/queryOptions";
import { findOrbitPreviewNodeByTarget } from "../lib/orbitResourceLookup";
import { orbitPreviewSessionKey } from "../lib/previewWindow";
import { openPreviewLiveWindow } from "../lib/previewExternalOpen";
import { useRouteActivity } from "../lib/routeActivity";
import { usePreviewHubStore } from "../stores/previewHub";
import { useLayoutStore } from "../stores/layout";
import { useOrbitStore } from "../stores/orbit";
import { openGlobalContextMenu } from "../components/context-menu/contextMenuEvents";
import { hostContextMenuId } from "../extensions/hostContextMenus";
import { PromptDialog } from "../components/ModalDialog";
import { PreviewHubProject, stateLabels } from "./PreviewHubProject";

function statusState(status: PreviewDevServerStatus | undefined, failed: boolean): PreviewDevServerState {
  if (failed) return "failed";
  return status?.state ?? "unknown";
}

export function PreviewHub() {
  const routeActive = useRouteActivity();
  const queryClient = useQueryClient();
  const selectedProjectId = useLayoutStore((state) => state.selectedProjectId);
  const selectProject = useLayoutStore((state) => state.selectProject);
  const openProjectIds = usePreviewHubStore((state) => state.openProjectIds);
  const activeProjectId = usePreviewHubStore((state) => state.activeProjectId);
  const projectAliases = usePreviewHubStore((state) => state.projectAliases);
  const openProject = usePreviewHubStore((state) => state.openProject);
  const activateProject = usePreviewHubStore((state) => state.activateProject);
  const closeProject = usePreviewHubStore((state) => state.closeProject);
  const renameProjectTab = usePreviewHubStore((state) => state.renameProjectTab);
  const reconcileProjects = usePreviewHubStore((state) => state.reconcileProjects);
  const [searchParams, setSearchParams] = useSearchParams();
  const [projectManagerOpen, setProjectManagerOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const initialized = useRef(false);
  const synchronizedProjectId = useRef<string | null>(selectedProjectId);
  const projectsQuery = useQuery({ ...wraptQueries.projects(), enabled: routeActive });
  const orbitQuery = useQuery({ ...wraptQueries.orbit(), enabled: routeActive });
  const hydratedOrbit = useOrbitStore((state) => state.hydrated ? state.document : null);
  const orbitBoards = hydratedOrbit?.boards ?? orbitQuery.data?.document.boards ?? [];
  const runtimesQuery = useQuery({ ...wraptQueries.previewDevServers(), enabled: routeActive });
  const projects = useMemo(() => (projectsQuery.data?.projects ?? []).filter((item) => item.availability === "available"), [projectsQuery.data?.projects]);
  const openProjects = useMemo(() => openProjectIds.flatMap((id) => {
    const project = projects.find((candidate) => candidate.id === id);
    return project ? [{ ...project, name: projectAliases[project.id] || project.name }] : [];
  }), [openProjectIds, projectAliases, projects]);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const tabStatusQueries = useQueries({
    queries: openProjects.map((project) => ({
      ...wraptQueries.previewDevServer(project.id, project.id === activeProjectId ? 2_000 : 5_000),
      enabled: routeActive,
    })),
  });
  const statusByProjectId = useMemo(() => {
    const statuses = new Map<string, PreviewDevServerStatus>();
    runtimesQuery.data?.runtimes.forEach((status) => statuses.set(status.projectId, status));
    openProjects.forEach((project, index) => {
      const status = tabStatusQueries[index]?.data;
      if (status) statuses.set(project.id, status);
    });
    return statuses;
  }, [openProjects, runtimesQuery.data?.runtimes, tabStatusQueries]);

  const setProjectParam = useCallback((projectId: string | null) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (projectId) next.set("project", projectId);
      else next.delete("project");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const chooseProject = (projectId: string) => {
    synchronizedProjectId.current = projectId;
    openProject(projectId);
    activateProject(projectId);
    if (selectedProjectId !== projectId) selectProject(projectId);
    setProjectParam(projectId);
    setProjectManagerOpen(false);
    setProjectSearch("");
  };

  const closeProjectTab = (projectId: string) => {
    const wasActive = usePreviewHubStore.getState().activeProjectId === projectId;
    closeProject(projectId);
    if (!wasActive) return;
    const nextProjectId = usePreviewHubStore.getState().activeProjectId;
    synchronizedProjectId.current = nextProjectId ?? selectedProjectId;
    if (nextProjectId) selectProject(nextProjectId);
    setProjectParam(nextProjectId);
  };

  useEffect(() => {
    if (!routeActive || !projectsQuery.isSuccess) return;
    const availableIds = projects.map((project) => project.id);
    const requested = searchParams.get("project");
    const fallback = requested && availableIds.includes(requested)
      ? requested
      : selectedProjectId && availableIds.includes(selectedProjectId)
        ? selectedProjectId
        : (availableIds[0] ?? null);
    reconcileProjects(availableIds, initialized.current ? null : fallback);
    if (!initialized.current) {
      initialized.current = true;
      const nextProjectId = requested && availableIds.includes(requested)
        ? requested
        : (usePreviewHubStore.getState().activeProjectId ?? fallback);
      if (nextProjectId) {
        synchronizedProjectId.current = nextProjectId;
        openProject(nextProjectId);
        if (selectedProjectId !== nextProjectId) selectProject(nextProjectId);
        setProjectParam(nextProjectId);
      }
    }
  }, [openProject, projects, projectsQuery.isSuccess, reconcileProjects, routeActive, searchParams, selectProject, selectedProjectId, setProjectParam]);

  useEffect(() => {
    if (!routeActive || !initialized.current || selectedProjectId === synchronizedProjectId.current) return;
    synchronizedProjectId.current = selectedProjectId;
    if (!selectedProjectId || selectedProjectId === activeProjectId) return;
    if (!projects.some((project) => project.id === selectedProjectId)) return;
    openProject(selectedProjectId);
    setProjectParam(selectedProjectId);
  }, [activeProjectId, openProject, projects, routeActive, selectedProjectId, setProjectParam]);

  useEffect(() => {
    if (!routeActive || !initialized.current) return;
    const requested = searchParams.get("project");
    if (!requested || requested === activeProjectId || !projects.some((project) => project.id === requested)) return;
    synchronizedProjectId.current = requested;
    openProject(requested);
    if (selectedProjectId !== requested) selectProject(requested);
  }, [activeProjectId, openProject, projects, routeActive, searchParams, selectProject, selectedProjectId]);

  useEffect(() => {
    if (!projectManagerOpen) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setProjectManagerOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [projectManagerOpen]);

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const candidates = openProjects.filter((project) => {
        const state = statusByProjectId.get(project.id)?.state;
        return state === "running" || state === "failed";
      });
      const succeeded: string[] = [];
      const failed: Array<{ name: string; message: string }> = [];
      for (const project of candidates) {
        try {
          const status = await apiClient.stopPreviewDevServer(project.id);
          if (status) queryClient.setQueryData(["preview-dev-server", project.id], status);
          succeeded.push(project.name);
        } catch (error) {
          failed.push({ name: project.name, message: error instanceof Error ? error.message : "Aktion fehlgeschlagen" });
        }
      }
      return { succeeded, failed };
    },
    onSuccess: async ({ succeeded, failed }) => {
      setBulkMessage(failed.length
        ? `${succeeded.length} gestoppt, ${failed.length} fehlgeschlagen: ${failed.map((item) => `${item.name}: ${item.message}`).join(" · ")}`
        : `${succeeded.length} ${succeeded.length === 1 ? "Projekt" : "Projekte"} gestoppt.`);
      setConfirmStopAll(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["preview-dev-server"] }),
        queryClient.invalidateQueries({ queryKey: ["preview-dev-servers"] }),
        queryClient.invalidateQueries({ queryKey: ["local-ports"] }),
      ]);
    },
  });

  const runningCount = openProjects.filter((project) => statusByProjectId.get(project.id)?.state === "running").length;
  const filteredProjects = projects.filter((project) => `${project.name} ${project.path}`.toLocaleLowerCase("de-DE").includes(projectSearch.trim().toLocaleLowerCase("de-DE")));

  if (projectsQuery.isLoading) return <div className="route-skeleton" aria-label="Previews werden geladen"><span /><span /><span /></div>;
  if (!projects.length) return <main className="preview-hub-empty"><ServerIcon /><strong>Kein verfügbares Projekt</strong></main>;

  return (
    <main className="preview-hub">
      <section className="preview-hub-tabs" aria-label="Geöffnete Preview-Projekte">
        <div className="preview-hub-tablist" role="tablist" aria-label="Preview-Projekte">
          {openProjects.map((project, index) => {
            const query = tabStatusQueries[index];
            const status = statusByProjectId.get(project.id);
            const state = statusState(status, Boolean(query?.isError));
            return <div className={`preview-hub-tab ${project.id === activeProjectId ? "is-active" : ""}`} key={project.id} data-state={state} onContextMenu={(event) => openGlobalContextMenu(event, {
              surface: "host.context-menu.preview",
              title: project.name,
              actions: [
                { id: hostContextMenuId("preview.open"), icon: <FolderCodeIcon />, onSelect: () => chooseProject(project.id) },
                { id: hostContextMenuId("preview.rename"), onSelect: () => setRenameTarget(project) },
                { id: hostContextMenuId("preview.duplicate"), icon: <CopyIcon />, onSelect: () => window.open(`/previews?project=${encodeURIComponent(project.id)}`, "_blank", "noopener,noreferrer") },
                { id: hostContextMenuId("preview.window"), icon: <ExternalLinkIcon />, onSelect: () => window.open(`/previews?project=${encodeURIComponent(project.id)}`, `preview-${project.id}`, "popup=yes,width=1280,height=800") },
                { id: hostContextMenuId("preview.device"), disabled: !status?.mainPort, onSelect: () => {
                  if (!status?.mainPort) return;
                  const configured = project.previews.find((preview) => preview.targetPort === status.mainPort);
                  const path = configured?.path ?? "/";
                  const matchingNode = findOrbitPreviewNodeByTarget(orbitBoards, project.id, status.mainPort, path);
                  const storageProfileId = matchingNode?.node.previewStorageProfileId ?? null;
                  const isolate = matchingNode?.node.previewIsolation ?? false;
                  openPreviewLiveWindow({
                    projectId: project.id,
                    port: status.mainPort,
                    path,
                    title: configured?.name ?? project.name,
                    mode: "tab",
                    sessionKey: orbitPreviewSessionKey({ projectId: project.id, previewTarget: `${status.mainPort}${path}`, storageProfileId }),
                    isolate,
                    storageProfileId,
                    requestedSlotId: matchingNode?.node.previewSlotId ?? null,
                  });
                } },
                { id: hostContextMenuId("preview.close"), icon: <CloseIcon />, danger: true, onSelect: () => closeProjectTab(project.id) },
              ],
            })}>
              <button type="button" role="tab" aria-selected={project.id === activeProjectId} onClick={() => chooseProject(project.id)}>
                <span className="preview-hub-tab-state" />
                <span>{project.name}</span>
                {status?.services.filter((service) => service.state === "failed").length ? <small>{status.services.filter((service) => service.state === "failed").length}</small> : null}
              </button>
              <button type="button" className="preview-hub-tab-close" aria-label={`${project.name} schließen, Laufzeit bleibt aktiv`} title="Tab schließen, Laufzeit bleibt aktiv" onClick={() => closeProjectTab(project.id)}><CloseIcon /></button>
            </div>;
          })}
          <button type="button" className="preview-hub-add-tab" aria-label="Preview-Projekt hinzufügen" onClick={() => setProjectManagerOpen(true)}><PlusIcon /><span>Projekt</span></button>
        </div>

        <button type="button" className="preview-hub-mobile-project" onClick={() => setProjectManagerOpen(true)}>
          <span className={`preview-hub-state is-${statusByProjectId.get(activeProjectId ?? "")?.state ?? "unknown"}`}><i /></span>
          <span><strong>{activeProject?.name ?? "Projekt auswählen"}</strong></span>
          <ChevronDownIcon />
        </button>

        <div className="preview-hub-tabs-summary">
          <details className="preview-hub-more">
            <summary aria-label="Projekt-Sammelaktionen"><MoreIcon /></summary>
            <div>
              <button type="button" disabled={!runningCount || bulkMutation.isPending} onClick={() => {
                if (!confirmStopAll) { setConfirmStopAll(true); return; }
                bulkMutation.mutate();
              }}><PowerIcon /><span><strong>{confirmStopAll ? "Wirklich alle stoppen" : "Alle stoppen"}</strong><small>{confirmStopAll ? "Erneut anklicken, um zu bestätigen" : "Nur geöffnete Projektlaufzeiten"}</small></span></button>
              <button type="button" onClick={() => setProjectManagerOpen(true)}><FolderCodeIcon /><span><strong>Projekte verwalten</strong><small>Tabs öffnen oder wieder aktivieren</small></span></button>
            </div>
          </details>
        </div>
      </section>

      {bulkMessage ? <div className={`preview-hub-alert ${bulkMessage.includes("fehlgeschlagen") ? "is-error" : "is-progress"}`} role="status"><ActivityIcon /><span>{bulkMessage}</span><button type="button" aria-label="Meldung schließen" onClick={() => setBulkMessage(null)}><CloseIcon /></button></div> : null}

      {activeProject ? <PreviewHubProject key={activeProject.id} project={activeProject} routeActive={routeActive} orbitBoards={orbitBoards} /> : <section className="preview-hub-stage-empty"><FolderCodeIcon /><strong>Kein Preview-Projekt geöffnet</strong><button type="button" className="preview-hub-primary" onClick={() => setProjectManagerOpen(true)}><PlusIcon />Projekt öffnen</button></section>}

      {projectManagerOpen ? createPortal(
        <div className="preview-project-dialog-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setProjectManagerOpen(false); }}>
          <section className="preview-project-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-project-dialog-title">
            <header><div><strong id="preview-project-dialog-title">Preview-Projekte</strong><span>Projekt öffnen oder zu einer laufenden Laufzeit wechseln</span></div><button type="button" aria-label="Projektauswahl schließen" onClick={() => setProjectManagerOpen(false)}><CloseIcon /></button></header>
            <label className="preview-project-search"><FolderCodeIcon /><input autoFocus value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Projekt oder Pfad suchen" aria-label="Preview-Projekte suchen" /></label>
            <div className="preview-project-list">
              {filteredProjects.map((project) => {
                const status = statusByProjectId.get(project.id);
                const isOpen = openProjectIds.includes(project.id);
                const state = status?.state ?? "stopped";
                return <button type="button" key={project.id} className={project.id === activeProjectId ? "is-active" : ""} onClick={() => chooseProject(project.id)}>
                  <span className={`preview-hub-state is-${state}`}><i /></span>
                  <span><strong>{project.name}</strong><small>{project.path}</small></span>
                  <span className="preview-project-list-meta">{isOpen ? "Geöffnet" : status?.state === "running" ? "Läuft" : stateLabels[state]}</span>
                </button>;
              })}
              {!filteredProjects.length ? <div className="preview-project-list-empty">Kein passendes Projekt gefunden.</div> : null}
            </div>
          </section>
        </div>, document.body,
      ) : null}
      <PromptDialog open={renameTarget !== null} title="Preview-Tab umbenennen" label="Name" initialValue={renameTarget?.name ?? ""} confirmLabel="Umbenennen" onConfirm={(name) => { if (renameTarget) renameProjectTab(renameTarget.id, name); setRenameTarget(null); }} onClose={() => setRenameTarget(null)} />
    </main>
  );
}
