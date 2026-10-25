import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { editorOpenEventSchema } from "@wrapt/contracts";
import { useLayoutStore } from "../stores/layout";
import { appBase } from "../lib/appUrl";
import { useEditorRuntime } from "./editor/runtime";
import { wraptQueries } from "../lib/queryOptions";

/**
 * „Open in Editor" aus T3 Code: Das Server-Shim `code` meldet einen Pfad über
 * `POST /api/v1/editor/open`; dieser WebSocket-Kanal leitet ihn an die
 * geöffnete Workbench weiter. Die Bridge fokussiert den passenden Editor:
 * im Layout als Panel, auf der eigenständigen Werkzeugseite als
 * interne Navigation nach `/code-editor?folder=…`, ohne die App neu zu laden.
 */
export function EditorOpenBridge() {
  const projects = useQuery(wraptQueries.projects());
  const openPanel = useLayoutStore((state) => state.openPanel);
  const navigate = useNavigate();
  const projectsRef = useRef(projects.data);
  projectsRef.current = projects.data;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    let closed = false;
    const openEditor = (path: string | null, file?: string) => {
      if (path && file) useEditorRuntime.getState().rememberFile(path, file);
      const list = projectsRef.current?.projects ?? [];
      const project = list.filter((candidate) => candidate.availability === "available"
        && candidate.path !== projectsRef.current?.projectsRoot
        && path && (path === candidate.path || path.startsWith(`${candidate.path}/`)))
        .sort((a, b) => b.path.length - a.path.length)[0];
      if (project) useLayoutStore.getState().selectProject(project.id);
      const base = appBase();
      const standalone = [`${base}/t3-code`, `${base}/code-editor`, `${base}/previews`]
        .some((prefix) => window.location.pathname === prefix || window.location.pathname.startsWith(`${prefix}/`));
      if (standalone || !project) {
        navigate(`/code-editor${path ? `?${new URLSearchParams({ folder: path })}` : ""}`);
      } else {
        const existing = useLayoutStore.getState().panels.find((panel) => panel.type === "code-server"
          && panel.projectId === project.id && (panel.codeServerFolder ?? project.path) === path);
        if (existing) useLayoutStore.getState().focusPanel(existing.id);
        else openPanel({ type: "code-server", projectId: project.id, ...(path !== project.path ? { codeServerFolder: path } : {}) });
      }
    };
    const onNavigate = (event: Event) => {
      const folder = (event as CustomEvent<{ folder: string | null }>).detail?.folder;
      if (folder === null || typeof folder === "string") openEditor(folder);
    };
    window.addEventListener("wrapt:editor-navigate", onNavigate);
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/v1/editor/ws`);
      socket.onopen = () => { retry = 0; };
      socket.onmessage = (event) => {
        let parsed;
        try {
          const data = JSON.parse(String(event.data));
          if (data?.type === "editor.runtime" && typeof data.folder === "string" && typeof data.ready === "boolean") {
            useEditorRuntime.getState().setReady(data.folder, data.ready);
            return;
          }
          parsed = editorOpenEventSchema.safeParse(data);
        } catch {
          return;
        }
        if (!parsed.success) return;
        openEditor(parsed.data.path, parsed.data.file);
      };
      socket.onclose = () => {
        useEditorRuntime.getState().disconnected();
        if (!closed) timer = window.setTimeout(connect, Math.min(15_000, 1_000 * 2 ** retry++));
      };
    };
    connect();
    return () => {
      closed = true; window.clearTimeout(timer); socket?.close();
      window.removeEventListener("wrapt:editor-navigate", onNavigate);
    };
  }, [navigate, openPanel]);

  return null;
}
