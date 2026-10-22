import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileIcon, FolderCodeIcon, FrameIcon, SaveIcon } from "../icons";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { wraptQueries } from "../../lib/queryOptions";
import { orbitNodeColor } from "../../lib/orbitAppearance";
import { formatUsageReset, orbitProviderWindows, orbitUsageEmptyMessage, orbitUsageRefreshIntervalMs } from "../../lib/orbitUsage";
import { useOrbitStore } from "../../stores/orbit";
import { OrbitToolContent } from "./OrbitToolContent";
import { useRouteActivity } from "../../lib/routeActivity";
import { orbitNodeRendererRegistry } from "../../extensions/orbitNodeRendererRegistry";
import { NoteOrbitNode } from "../notes/NoteOrbitNode.js";
import { orbitToolLabels as toolLabels } from "../../lib/toolLabels";
import { FocusNodeAction, focusFromHeader } from "./OrbitNodeFocusAction";
import { OrbitSnippetEditor } from "./OrbitSnippetEditor";
import { OrbitTodoCard } from "./OrbitTodoCard";
import { OrbitNodeStandaloneAction } from "./OrbitNodeStandaloneAction";
import { useOrbitCanvasScale } from "./useOrbitCanvasScale";
import { terminalStandalonePathForTool } from "../terminal/terminal-handoff";
import { useOrbitNodeRuntime, nodeMap, projectNodeCounts, useActiveOrbitNode, EdgeHandles, OrbitNodeResizer, NodeChrome } from "./OrbitNodeChrome";

export function ProjectNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const relatedCount = useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    if (!board || !node.projectId) return 0;
    return Math.max(0, (projectNodeCounts(board.nodes).get(node.projectId) ?? 0) - 1);
  });
  const { projects } = useOrbitNodeRuntime();
  const project = projects.find((candidate) => candidate.id === node.projectId);
  const color = orbitNodeColor(node);
  return (
    <div className={`orbit-project-node ${selected ? "is-selected" : ""}`} style={{ "--orbit-project-color": color } as React.CSSProperties}>
      <OrbitNodeResizer id={id} selected={selected} minWidth={190} minHeight={140} />
      <div className="orbit-project-orbit orbit-node-drag-handle" onDoubleClick={(event) => focusFromHeader(event, id)}>
        <FolderCodeIcon className="h-5 w-5" />
        <span>Projekt</span>
        <strong>{project?.name ?? node.title}</strong>
        <small>{relatedCount} verbundene Knoten</small>
        <FocusNodeAction id={id} />
      </div>
      <EdgeHandles />
    </div>
  );
}

export function ToolNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const focusNode = useOrbitStore((state) => state.focusNode);
  const runtime = useOrbitNodeRuntime();
  const project = runtime.projects.find((candidate) => candidate.id === node.projectId);
  const zoom = useOrbitCanvasScale();
  const type = node.toolType ?? "terminal";
  const standalonePath = terminalStandalonePathForTool(node.runtimeId, type);
  return (
    <div className={`orbit-live-node ${selected ? "is-selected" : ""}`}>
      <OrbitNodeResizer id={id} selected={selected} minWidth={320} minHeight={220} />
      <header className="orbit-node-header orbit-node-drag-handle" onDoubleClick={(event) => focusFromHeader(event, id)}>
        <strong>{node.title || toolLabels[type]}</strong>
        {standalonePath ? <OrbitNodeStandaloneAction path={standalonePath} /> : null}
        <FocusNodeAction id={id} />
      </header>
      <div className="orbit-tool-content nodrag nopan nowheel">
        <OrbitToolContent
          node={node}
          project={project}
          services={runtime.services}
          selected={selected}
          zoom={zoom}
          onFocus={() => focusNode(id)}
        />
      </div>
      <EdgeHandles />
    </div>
  );
}

export function NoteNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  return <NodeChrome id={id} title={node.title} selected={selected}><NoteOrbitNode id={id} /></NodeChrome>;
}

export function TodoNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  return <NodeChrome id={id} title={node.title} selected={selected}><OrbitTodoCard id={id} title={node.title} content={node.content} /></NodeChrome>;
}

export function SnippetNode({ id, selected }: { id: string; selected: boolean }) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const node = useActiveOrbitNode(id)!;
  return <NodeChrome id={id} title={node.title} selected={selected}><OrbitSnippetEditor title={node.title} language={node.language ?? "text"} content={node.content} onLanguageChange={(language) => updateNode(id, { language })} onContentChange={(content) => updateNode(id, { content })} /></NodeChrome>;
}

export function FileNode({ id, selected }: { id: string; selected: boolean }) {
  const updateNode = useOrbitStore((state) => state.updateNode);
  const node = useActiveOrbitNode(id)!;
  const [status, setStatus] = useState<string | null>(null);
  const [overwriteVersion, setOverwriteVersion] = useState<string | null>(null);
  const save = async () => {
    if (!node.projectId) { setStatus("Bitte zuerst ein Projekt zuordnen."); return; }
    try {
      const result = await apiClient.createProjectFile(node.projectId, {
        path: node.title,
        content: node.content,
        overwrite: overwriteVersion !== null,
        ...(overwriteVersion !== null ? { expectedVersion: overwriteVersion } : {}),
      });
      if (!result) throw new Error("Der Server hat keine Dateibestätigung zurückgegeben.");
      setStatus(`${result.path} wurde gespeichert.`);
      setOverwriteVersion(result.version);
    } catch (error) {
      const currentVersion = error instanceof ApiClientError && typeof error.details?.currentVersion === "string"
        ? error.details.currentVersion
        : null;
      setOverwriteVersion(error instanceof ApiClientError && error.code === "FILE_EXISTS" ? currentVersion : null);
      setStatus(error instanceof Error ? error.message : "Datei konnte nicht gespeichert werden.");
    }
  };
  return <NodeChrome id={id} title={node.title} selected={selected}><input className="orbit-file-path" aria-label="Relativer Dateipfad" value={node.title} onChange={(event) => { updateNode(id, { title: event.target.value || "datei.txt" }); setOverwriteVersion(null); }} /><textarea aria-label="Dateiinhalt bearbeiten" value={node.content} onChange={(event) => updateNode(id, { content: event.target.value })} spellCheck={false} className="orbit-code-editor nodrag nowheel" /><button type="button" className="orbit-inline-action" onClick={() => void save()}><SaveIcon className="h-3.5 w-3.5" /> {overwriteVersion ? "Datei aktualisieren" : "Im Projekt erstellen"}</button>{status ? <p className="orbit-node-message" role="status">{status}</p> : null}</NodeChrome>;
}

export function AssetNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const url = node.assetId ? apiClient.orbitAssetUrl(node.assetId) : "";
  const image = Boolean(node.assetMimeType?.startsWith("image/"));
  const size = new Intl.NumberFormat("de-DE", { style: "unit", unit: "byte", unitDisplay: "narrow", notation: "compact" }).format(node.assetBytes ?? 0);
  if (image) return <div className={`orbit-image-node ${selected ? "is-selected" : ""}`}>
    <OrbitNodeResizer id={id} selected={selected} minWidth={120} minHeight={90} />
    <div className="orbit-image-drag-handle orbit-node-drag-handle" aria-label="Bild verschieben" title="Bild verschieben"><span /></div>
    <img src={url} alt="" />
    <EdgeHandles />
  </div>;
  return <NodeChrome id={id} title={node.title} selected={selected}>
    <div className="orbit-asset-file"><FileIcon className="h-8 w-8" /><strong>{node.title}</strong><small>{node.assetMimeType} · {size}</small></div>
    <a className="orbit-inline-action orbit-asset-link" href={url} download>Öffnen</a>
  </NodeChrome>;
}

export function UsageNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  const routeActive = useRouteActivity();
  const usage = useQuery({ ...wraptQueries.usage(), enabled: routeActive });
  const provider = usage.data?.providers.find((candidate) => candidate.providerId === node.provider);
  const windows = orbitProviderWindows(provider);
  const emptyMessage = orbitUsageEmptyMessage(provider, usage);
  return <NodeChrome id={id} title={`${provider?.providerName ?? node.title} Limits`} selected={selected}><div className="orbit-usage-list">{windows.length ? windows.map((window) => <div className="orbit-usage-row" key={window.id}><div><span>{window.label}</span><strong>{window.remaining}% frei</strong></div><div className="orbit-usage-track"><i style={{ width: `${window.remaining}%` }} /></div><small className="orbit-usage-reset">{formatUsageReset(window.resetsAt)}</small></div>) : <p>{emptyMessage}</p>}</div><small className="orbit-usage-updated">Aktualisierung alle {orbitUsageRefreshIntervalMs / 1_000} Sekunden</small></NodeChrome>;
}

export function FrameNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useActiveOrbitNode(id)!;
  return <div className={`orbit-frame-node ${selected ? "is-selected" : ""}`}><OrbitNodeResizer id={id} selected={selected} minWidth={320} minHeight={240} /><div className="orbit-frame-title orbit-node-drag-handle" onDoubleClick={(event) => focusFromHeader(event, id)}><FrameIcon className="h-3.5 w-3.5" /><strong>{node.title}</strong><FocusNodeAction id={id} /></div><EdgeHandles frame /></div>;
}

export function ExtensionOrbitNode({ id, selected }: { id: string; selected: boolean }) {
  const node = useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board ? nodeMap(board.nodes).get(id) : undefined;
  });
  if (node === undefined) return null;
  const renderer = orbitNodeRendererRegistry.getRenderer(node.contributionId);
  if (renderer !== undefined) return renderer.render(node);
  return (
    <NodeChrome id={id} title={node.title} selected={selected}>
      <div className="orbit-extension-missing">
        <strong>Extension nicht verfügbar</strong>
        <span className="font-mono">{node.extensionId ?? "unbekannt"}</span>
        <p>Die Daten dieses Elements bleiben erhalten.</p>
      </div>
    </NodeChrome>
  );
}
