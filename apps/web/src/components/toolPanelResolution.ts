import type { Panel, Project, ServiceMode } from "@wrapt/contracts";
import { codeServerUnavailableReason, type CodeServerState } from "../lib/codeServerAvailability";

export interface ResolvedPanel {
  url: string | null;
  mode: ServiceMode;
  embed: boolean;
  proxyUrl: string | null;
  reason: string | null;
  targetPort: number | null;
  path: string;
}

export function projectBoundCodeServerUrl(baseUrl: string, projectPath: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("folder", projectPath);
  return url.toString();
}

export function projectBoundCodeServerProxyUrl(projectPath: string): string {
  return `/editor/?${new URLSearchParams({ folder: projectPath }).toString()}`;
}

export function resolvePanel(panel: Panel, project: Project | undefined, codeServerMode: ServiceMode, codeServerState?: CodeServerState): ResolvedPanel | null {
  if (panel.type === "terminal" || panel.type === "codex" || panel.type === "claude") {
    return { url: null, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: null, path: "/" };
  }
  if (panel.type === "t3-code") {
    return {
      url: project?.links.t3Code ?? null,
      mode: "hybrid",
      embed: true,
      proxyUrl: "/t3",
      reason: null,
      targetPort: null,
      path: "/",
    };
  }
  if (panel.type === "opencode") {
    return { url: "/opencode", mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: null, path: "/" };
  }
  if (panel.type === "browser") {
    return { url: null, mode: "external", embed: false, proxyUrl: null, reason: "Das frühere Browser-Werkzeug wurde entfernt. Der Bereich bleibt erhalten, damit seine Position, Verbindungen und gespeicherten Inhalte nicht verloren gehen.", targetPort: null, path: "/" };
  }
  if (panel.type === "files" || panel.type === "hermes") {
    return { url: null, mode: "embedded", embed: true, proxyUrl: null, reason: null, targetPort: null, path: "/" };
  }
  if (panel.type === "notion") {
    return { url: null, mode: "external", embed: false, proxyUrl: null, reason: "Diese frühere Notion-Integration wird nicht mehr ausgeführt. Der Knoten bleibt erhalten, damit seine Position, Verbindungen und gespeicherten Inhalte nicht verloren gehen.", targetPort: null, path: "/" };
  }
  if (panel.type === "preview" && !project) {
    return { url: null, mode: "embedded", embed: false, proxyUrl: null, reason: "Keine Preview ausgewählt.", targetPort: null, path: "/" };
  }
  if (!project) return null;
  if (panel.type === "code-server") {
    const configuredUrl = project.links.codeServer;
    const targetFolder = panel.codeServerFolder ?? project.path;
    const url = configuredUrl === null ? null : projectBoundCodeServerUrl(configuredUrl, targetFolder);
    const reason = codeServerUnavailableReason(configuredUrl !== null, codeServerState);
    const embed = reason === null && (codeServerMode === "hybrid" || codeServerMode === "embedded");
    return {
      url: reason === null ? url : null,
      mode: codeServerMode,
      embed,
      proxyUrl: embed ? projectBoundCodeServerProxyUrl(targetFolder) : null,
      reason,
      targetPort: null,
      path: "/",
    };
  }
  const preview = project.previews.find((candidate) => candidate.id === panel.previewId);
  if (!preview) {
    return { url: null, mode: "external", embed: false, proxyUrl: null, reason: "Preview wurde nicht gefunden.", targetPort: null, path: "/" };
  }
  return {
    url: preview.url ?? (preview.targetPort ? `http://127.0.0.1:${preview.targetPort}${preview.path}` : null),
    mode: preview.mode,
    embed: preview.url !== null || preview.targetPort !== null,
    proxyUrl: null,
    reason: preview.url === null && preview.targetPort === null ? "Für diese Preview ist kein Ziel konfiguriert." : null,
    targetPort: preview.targetPort,
    path: preview.path,
  };
}
