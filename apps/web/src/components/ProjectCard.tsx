import { Link, useNavigate } from "react-router";
import { ChevronDownIcon, CodeServerIcon, T3CodeIcon, TerminalIcon } from "./icons";
import type { Project } from "@wrapt/contracts";
import { Badge } from "./primitives";
import { openProjectDefault, openProjectStandaloneDefault, openProjectToolStandalone, openToolForProject } from "../lib/wraptActions";
import { projectToolOptions, projectToolPath } from "../lib/projectTools";
import { codeServerUnavailableReason, type CodeServerState } from "../lib/codeServerAvailability";
import { useSidebarPreferences } from "../stores/sidebarPreferences";

type ProjectIssue = Exclude<Project["availability"], "available">;

const availabilityTone: Record<ProjectIssue, "bad" | "warn"> = {
  missing: "bad",
  inaccessible: "bad",
  symlink: "warn",
};

const availabilityLabel: Record<ProjectIssue, string> = {
  missing: "fehlend",
  inaccessible: "gesperrt",
  symlink: "Symlink",
};

export function ProjectCard({ project, codeServerState }: { project: Project; codeServerState: CodeServerState }) {
  const navigate = useNavigate();
  const codeServerReason = codeServerUnavailableReason(project.links.codeServer !== null, codeServerState);
  const orbitEnabled = useSidebarPreferences((state) => !state.hiddenPages.has("workbench"));
  const tools = projectToolOptions(project, codeServerReason === null);
  const primaryPath = project.links.t3Code
    ? "/t3-code"
    : orbitEnabled
      ? "/orbit"
      : codeServerReason === null ? "/code-editor" : "/terminal";
  const openPrimary = () => {
    if (project.availability !== "available") return;
    if (project.links.t3Code) {
      openToolForProject(project, "t3-code");
      navigate("/t3-code");
      return;
    }
    if (orbitEnabled) {
      openProjectDefault(project, codeServerReason === null);
      navigate("/orbit");
    } else {
      navigate(openProjectStandaloneDefault(project, codeServerReason === null));
    }
  };

  return (
    <article className="project-card group border-b border-line-soft py-6 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-text">
            <Link to={`/projects/${project.id}`} className="project-title-link hover:underline">
              {project.name}
            </Link>
          </h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-muted">{project.description}</p>
        </div>
        {project.availability !== "available" ? <Badge tone={availabilityTone[project.availability]}>{availabilityLabel[project.availability]}</Badge> : null}
      </div>

      {project.previews.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-faint">
          {project.previews.map((p) => <Badge key={p.id}>{p.name}</Badge>)}
        </div>
      ) : null}

      <div className="project-actions mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={openPrimary}
          disabled={project.availability !== "available"}
          data-prefetch-route={primaryPath}
          className="quiet-button-primary max-md:basis-full"
        >
          {project.links.t3Code ? <T3CodeIcon className="h-3.5 w-3.5" /> : orbitEnabled ? <T3CodeIcon className="h-3.5 w-3.5" /> : codeServerReason === null ? <CodeServerIcon className="h-3.5 w-3.5" /> : <TerminalIcon className="h-3.5 w-3.5" />}
          {project.links.t3Code ? "T3 öffnen" : orbitEnabled ? "Orbit öffnen" : codeServerReason === null ? "Editor öffnen" : "Terminal öffnen"}
        </button>
        <details className="project-tools-menu">
          <summary aria-label="Weitere Werkzeuge öffnen" title="Weitere Werkzeuge"><ChevronDownIcon className="h-4 w-4" /><span>Weitere</span><span className="project-tools-count">{tools.length}</span></summary>
          <div role="menu">
            {tools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  role="menuitem"
                  disabled={project.availability !== "available"}
                  data-prefetch-route={projectToolPath(tool)}
                  onClick={() => {
                    navigate(openProjectToolStandalone(project, tool));
                  }}
                >
                  <Icon className="h-4 w-4" /> {tool.label} öffnen
                </button>
              );
            })}
          </div>
        </details>
      </div>
      {project.availability !== "available" ? <p className="project-attention-hint">Projektpfad prüfen, bevor Werkzeuge geöffnet werden können.</p> : null}
      {project.links.codeServer !== null && codeServerReason ? <p className="project-attention-hint">Editor nicht verfügbar: {codeServerReason}</p> : null}
    </article>
  );
}
