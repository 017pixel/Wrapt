import type { Project } from "@wrapt/contracts";
import { useLayoutStore } from "../stores/layout";
import { useTerminalWorkspaceStore } from "../stores/terminalWorkspace";
import type { ProjectToolOption } from "./projectTools";

/** Öffnet ein Projekt im verfügbaren Editor oder Terminal. */
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
      return "/hermes-agent";
  }
}
