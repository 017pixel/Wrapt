import type { Project } from "@wrapt/contracts";
import { useLayoutStore } from "../stores/layout";
import { useTerminalWorkspaceStore } from "../stores/terminalWorkspace";
import type { ProjectToolOption } from "./projectTools";

const ORBIT_INTENTS_KEY = "wrapt-orbit-open-intents";

export interface OrbitOpenIntent {
  type: "project" | "tool";
  title: string;
  projectId: string;
  toolType?: "t3-code" | "code-server" | "preview";
  previewId?: string;
}

function queueOrbitIntents(intents: OrbitOpenIntent[]): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ORBIT_INTENTS_KEY, JSON.stringify(intents));
}

export function consumeOrbitIntents(): OrbitOpenIntent[] {
  if (typeof window === "undefined") return [];
  const raw = window.sessionStorage.getItem(ORBIT_INTENTS_KEY);
  window.sessionStorage.removeItem(ORBIT_INTENTS_KEY);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((item): item is OrbitOpenIntent =>
      typeof item === "object" && item !== null &&
      ((item as OrbitOpenIntent).type === "project" || (item as OrbitOpenIntent).type === "tool") &&
      typeof (item as OrbitOpenIntent).title === "string" &&
      typeof (item as OrbitOpenIntent).projectId === "string",
    ) : [];
  } catch {
    return [];
  }
}

export function openProjectDefault(project: Project, codeServerAvailable: boolean): void {
  const store = useLayoutStore.getState();
  store.selectProject(project.id);
  const intents: OrbitOpenIntent[] = [{ type: "project", title: project.name, projectId: project.id }];
  if (project.links.t3Code !== null) {
    intents.push({ type: "tool", title: "T3 Code", projectId: project.id, toolType: "t3-code" });
  } else if (project.previews.length > 0) {
    intents.push({ type: "tool", title: project.previews[0]!.name, projectId: project.id, toolType: "preview", previewId: project.previews[0]!.id });
  } else if (project.links.codeServer !== null && codeServerAvailable) {
    intents.push({ type: "tool", title: "Code-Server", projectId: project.id, toolType: "code-server" });
  }
  queueOrbitIntents(intents);
}

/** Öffnet ein Projekt ohne Orbit im verfügbaren Editor oder Terminal. */
export function openProjectStandaloneDefault(project: Project, codeServerAvailable: boolean): "/code-editor" | "/terminal" {
  useLayoutStore.getState().selectProject(project.id);
  if (project.links.codeServer !== null && codeServerAvailable) return "/code-editor";
  useTerminalWorkspaceStore.getState().addTab("standalone", project.id, "shell");
  return "/terminal";
}

export function openToolForProject(
  project: Project,
  type: "t3-code" | "code-server",
): void {
  void type;
  useLayoutStore.getState().selectProject(project.id);
}

export function openPreviewForProject(project: Project, previewId: string): void {
  void previewId;
  useLayoutStore.getState().selectProject(project.id);
}

/**
 * Öffnet ein Projekt in einem Werkzeug der passenden Standalone-Seite: Das
 * Projekt wird als aktives Projekt gesetzt, bei Terminal-Werkzeugen zusätzlich
 * ein Tab mit diesem Projekt angelegt, und der Zielpfad zurückgegeben.
 */
export function openProjectToolStandalone(project: Project, tool: ProjectToolOption): string {
  const layout = useLayoutStore.getState();
  layout.selectProject(project.id);
  switch (tool.type) {
    case "terminal":
      useTerminalWorkspaceStore.getState().addTab("standalone", project.id, "shell");
      return "/terminal";
    case "codex":
      useTerminalWorkspaceStore.getState().addTab("codex-standalone", project.id, "codex");
      return "/codex";
    case "claude":
      return "/claude";
    case "opencode":
      return "/opencode";
    case "t3-code":
      return "/t3-code";
    case "code-server":
      return "/code-editor";
    case "files":
      return "/files";
    case "preview":
      return tool.previewId ? `/previews?preview=${encodeURIComponent(tool.previewId)}` : "/previews";
    default:
      return "/orbit";
  }
}
