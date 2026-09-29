import type { ProjectsResponse } from "@wrapt/contracts";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "react-router";
import { ProjectIcon } from "../components/icons";
import { formatRelativeTime } from "../lib/format";
import { Panel, PanelError, PanelSkeleton, queryMessage } from "./DashboardPanels";

type Project = ProjectsResponse["projects"][number];

function latestActivity(project: Project): { at: string; source: string } | null {
  const activity = [
    { at: project.activity.lastWorkbenchUseAt, source: "Orbit" },
    { at: project.activity.lastFilesystemChangeAt, source: "Dateien" },
    { at: project.activity.lastGitCommitAt, source: "Git" },
  ].filter((item): item is { at: string; source: string } => item.at !== null && Number.isFinite(Date.parse(item.at)));

  return activity.sort((left, right) => Date.parse(right.at) - Date.parse(left.at))[0] ?? null;
}

export function DashboardRecentProjects({
  projects,
}: {
  projects: UseQueryResult<ProjectsResponse, Error>;
}) {
  const recent = projects.data?.projects
    .filter((project) => project.availability === "available")
    .map((project) => ({ project, activity: latestActivity(project) }))
    .filter((item): item is { project: Project; activity: NonNullable<ReturnType<typeof latestActivity>> } => item.activity !== null)
    .sort((left, right) => Date.parse(right.activity.at) - Date.parse(left.activity.at))
    .slice(0, 3) ?? [];

  return (
    <Panel
      title="Zuletzt aktiv"
      icon={<ProjectIcon className="h-4 w-4" />}
      name="recent-projects"
      className="is-span-5 dash-recent-projects-panel"
      meta={<Link to="/projects" className="dash-link">Alle Projekte</Link>}
    >
      {projects.isError ? (
        <PanelError message={queryMessage(projects.error, "Projektaktivität konnte nicht geladen werden.")} />
      ) : projects.isPending ? (
        <PanelSkeleton label="Projektaktivität lädt" rows={3} />
      ) : recent.length ? (
        <ul className="dash-recent-project-list">
          {recent.map(({ project, activity }) => (
            <li key={project.id}>
              <Link to={`/projects/${project.id}`}>
                <strong>{project.name}</strong>
                <small>{activity.source} · {formatRelativeTime(activity.at)}</small>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dash-muted">Noch keine Projektaktivität erfasst.</p>
      )}
    </Panel>
  );
}
