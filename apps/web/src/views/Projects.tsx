import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloseIcon, FolderCodeIcon, SearchIcon } from "../components/icons";
import type { Project } from "@wrapt/contracts";
import { wraptQueries } from "../lib/queryOptions";
import { QueryBoundary } from "../components/QueryBoundary";
import { ProjectCard } from "../components/ProjectCard";
import { EmptyState } from "../components/EmptyState";
import { useRouteActivity } from "../lib/routeActivity";
import { codeServerState, type CodeServerState } from "../lib/codeServerAvailability";
import "./projects.css";

function ProjectGroup({ title, description, projects, editorState }: { title?: string; description?: string; projects: Project[]; editorState: CodeServerState }) {
  if (projects.length === 0) return null;
  return (
    <section className={`document-section project-group${title ? "" : " project-group-available"}`}>
      {title ? (
        <div className="section-heading">
          <div>
            <h2 className="section-title">{title}</h2>
            {description ? <p className="section-subtitle">{description}</p> : null}
          </div>
        </div>
      ) : null}
      <div className="border-t border-line">
        {projects.map((project) => <ProjectCard key={project.id} project={project} codeServerState={editorState} />)}
      </div>
    </section>
  );
}

function ProjectsSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="projects-search">
      <SearchIcon className="h-4 w-4" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onChange("");
        }}
        placeholder="Projekte oder Ordner suchen …"
        aria-label="Projekte oder Ordner durchsuchen"
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="Suche leeren">
          <CloseIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function filterProjects(projects: Project[], query: string): Project[] {
  const normalized = query.trim().toLocaleLowerCase("de-DE");
  if (!normalized) return projects;
  return projects.filter((project) =>
    `${project.name} ${project.path} ${project.description}`.toLocaleLowerCase("de-DE").includes(normalized),
  );
}

export function Projects() {
  const routeActive = useRouteActivity();
  const projects = useQuery({ ...wraptQueries.projects(), enabled: routeActive });
  const services = useQuery({ ...wraptQueries.services(), enabled: routeActive });
  const editorState = codeServerState(services.data?.services);
  const [query, setQuery] = useState("");
  const filteredProjects = useMemo(() => filterProjects(projects.data?.projects ?? [], query), [projects.data?.projects, query]);

  return (
    <div className="page-scroll">
      <div className="page-frame projects-page">
        <div className="page-heading">
          <h1>Projekte</h1>
          <p>Alle lokalen Arbeitsbereiche und ihre Werkzeuge.</p>
        </div>
        <ProjectsSearch value={query} onChange={setQuery} />
        <QueryBoundary {...projects} loadingLabel="Projekte laden…">
          {() => filteredProjects.length === 0 ? (
            <EmptyState
              icon={<FolderCodeIcon className="h-6 w-6" />}
              title={query.trim() ? "Keine passenden Projekte" : "Keine Projekte"}
              description={query.trim() ? "Passe den Suchbegriff an oder lösche die Suche." : "Im Projektordner wurden keine Arbeitsbereiche gefunden."}
            />
          ) : (
            <div className="projects-results">
              <ProjectGroup projects={filteredProjects.filter((project) => project.availability === "available")} editorState={editorState} />
              <ProjectGroup
                title="Benötigt Aufmerksamkeit"
                description="Diese Projekte können wegen ihres Pfads oder Zugriffs nicht geöffnet werden."
                projects={filteredProjects.filter((project) => project.availability !== "available")}
                editorState={editorState}
              />
            </div>
          )}
        </QueryBoundary>
      </div>
    </div>
  );
}
