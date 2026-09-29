import { useNavigate, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, EyeIcon, FolderTreeIcon, PreviewsIcon, ServicesIcon } from "../components/icons";
import { CodeServerIcon, T3CodeIcon, TerminalIcon } from "../components/icons";
import { wraptQueries } from "../lib/queryOptions";
import { QueryBoundary } from "../components/QueryBoundary";
import { Card } from "../components/Card";
import { Badge, StateDot } from "../components/primitives";
import { EmptyState } from "../components/EmptyState";
import { openPreviewForProject, openProjectDefault, openProjectStandaloneDefault, openToolForProject } from "../lib/wraptActions";
import { useRouteActivity } from "../lib/routeActivity";
import { codeServerState, codeServerUnavailableReason } from "../lib/codeServerAvailability";
import { useSidebarPreferences } from "../stores/sidebarPreferences";

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const orbitEnabled = useSidebarPreferences((state) => !state.hiddenPages.has("workbench"));
  const routeActive = useRouteActivity();
  const projects = useQuery({ ...wraptQueries.projects(), enabled: routeActive });
  const services = useQuery({ ...wraptQueries.services(), enabled: routeActive });
  const runtime = useQuery({ ...wraptQueries.previewDevServer(projectId ?? null, 5_000), enabled: routeActive && Boolean(projectId) });

  return (
    <div className="page-scroll">
      <div className="page-frame max-w-4xl">
        <button
          type="button"
          onClick={() => navigate("/projects")}
          className="mb-8 flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-text max-md:-mx-2 max-md:min-h-[44px] max-md:rounded-md max-md:px-2 max-md:py-2 max-md:hover:bg-ink-800"
        >
          <ArrowLeftIcon className="h-4 w-4" /> Projekte
        </button>
        <QueryBoundary {...projects} loadingLabel="Projekt lädt…">
          {(data) => {
            const project = data.projects.find((p) => p.id === projectId);
            if (!project) {
              return <EmptyState title="Projekt nicht gefunden" description="Dieses lokale Projekt ist nicht verfügbar." />;
            }
            const editorReason = codeServerUnavailableReason(project.links.codeServer !== null, codeServerState(services.data?.services));
            return (
              <>
                <div className="page-heading">
                  <h1>{project.name}</h1>
                  <p>{project.description}</p>
                </div>
                <Card title="Projektinformationen">
                  <dl className="text-[13px]">
                    <div className="data-row">
                      <dt className="w-32 text-faint">Verfügbarkeit</dt>
                      <dd className="flex items-center gap-1.5 text-text">
                        <StateDot state={project.availability === "available" ? "active" : project.availability === "symlink" ? "unknown" : "error"} />
                        {project.availability}
                      </dd>
                    </div>
                    <div className="data-row">
                      <dt className="flex w-32 items-center gap-1.5 text-faint">
                        <FolderTreeIcon className="h-3.5 w-3.5" /> Pfad
                      </dt>
                      <dd className="min-w-0 break-all font-mono text-[12px] text-text">{project.path}</dd>
                    </div>
                  </dl>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (project.links.t3Code) {
                          openToolForProject(project, "t3-code");
                          navigate("/t3-code");
                        } else if (orbitEnabled) {
                          openProjectDefault(project, editorReason === null);
                          navigate("/orbit");
                        } else {
                          navigate(openProjectStandaloneDefault(project, editorReason === null));
                        }
                      }}
                      className="quiet-button-primary"
                    >
                      {project.links.t3Code || orbitEnabled ? <T3CodeIcon className="h-3.5 w-3.5" /> : editorReason === null ? <CodeServerIcon className="h-3.5 w-3.5" /> : <TerminalIcon className="h-3.5 w-3.5" />}
                      {project.links.t3Code ? "T3 öffnen" : orbitEnabled ? "Orbit öffnen" : editorReason === null ? "Editor öffnen" : "Terminal öffnen"}
                    </button>
                    <button
                      type="button"
                      disabled={editorReason !== null}
                      onClick={() => {
                        openToolForProject(project, "code-server");
                        navigate("/code-editor");
                      }}
                      className="quiet-button"
                    >
                      <CodeServerIcon className="h-3.5 w-3.5" /> Editor
                    </button>
                  </div>
                  {editorReason ? <p className="mt-3 text-[12px] text-faint">{editorReason}</p> : null}
                </Card>

                <Card title="Projektlaufzeit" subtitle={runtime.data?.profileSource === "configured" ? "preview.config.json" : "automatisch erkannt"}>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-line-soft bg-ink-800 px-3 py-3 max-md:flex-col max-md:items-stretch">
                    <div className="flex min-w-0 items-center gap-3">
                      <PreviewsIcon className="h-5 w-5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-[13px] font-medium text-text">Frontend, Backend und lokale Dienste</div>
                        <div className="mt-0.5 text-[11px] text-faint">
                          {runtime.isLoading ? "Laufzeit wird erkannt…" : runtime.data ? `${runtime.data.services.length} Dienste · ${runtime.data.state === "running" ? "läuft" : "gestoppt"}` : "Laufzeit konnte nicht geladen werden"}
                        </div>
                      </div>
                    </div>
                    <button type="button" className="quiet-button-primary" onClick={() => { openPreviewForProject(project, ""); navigate("/previews"); }}>
                      <ServicesIcon className="h-3.5 w-3.5" /> Preview verwalten
                    </button>
                  </div>
                  {runtime.data?.services.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {runtime.data.services.map((service) => <Badge key={service.id} tone={service.state === "running" ? "ok" : "default"}>{service.name}{service.port ? ` :${service.port}` : ""}</Badge>)}
                    </div>
                  ) : null}
                  {project.previews.length > 0 ? (
                    <ul className="border-t border-line-soft">
                      {project.previews.map((preview) => (
                        <li key={preview.id} className="data-row">
                          <EyeIcon className="h-4 w-4 text-muted" />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium text-text">{preview.name}</div>
                            <div className="truncate font-mono text-[11px] text-faint">{preview.url}</div>
                          </div>
                          <Badge tone="default">{preview.mode}</Badge>
                          <button
                            type="button"
                            onClick={() => {
                              openPreviewForProject(project, preview.id);
                              navigate(`/previews?preview=${encodeURIComponent(preview.id)}`);
                            }}
                              className="quiet-button text-[12px] max-md:text-[13px]"
                          >
                            Öffnen
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              </>
            );
          }}
        </QueryBoundary>
      </div>
    </div>
  );
}
