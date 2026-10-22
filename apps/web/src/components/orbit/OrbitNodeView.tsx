import { memo, useMemo } from "react";
import { type NodeProps } from "@xyflow/react";
import { useOrbitStore } from "../../stores/orbit";
import { OrbitGalleryNode } from "./OrbitGalleryNode";
import "./orbit-cards.css";
import { CodePluginSurface } from "../../extensions/code-surface";
import { nodeMap, NodeChrome } from "./OrbitNodeChrome";
import { ProjectNode, ToolNode, NoteNode, TodoNode, SnippetNode, FileNode, AssetNode, UsageNode, FrameNode, ExtensionOrbitNode } from "./OrbitContentNodes";
import { HermesStatusNode, HermesTasksNode, HermesCronNode, HermesResultsNode } from "./OrbitHermesNodes";
import { PreviewGroupNode, PreviewSlotNode } from "./OrbitPreviewNodes";
export { OrbitNodeRuntimeProvider, type OrbitNodeRuntimeData } from "./OrbitNodeChrome";

function OrbitNodeComponent(props: NodeProps) {  const id = props.id;
  const selected = Boolean(props.selected);
  const type = useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board ? nodeMap(board.nodes).get(id)?.type : undefined;
  });
  const content = useMemo(() => {
    if (type === "project") return <ProjectNode id={id} selected={selected} />;
    if (type === "tool") return <ToolNode id={id} selected={selected} />;
    if (type === "previewGroup") return <PreviewGroupNode id={id} selected={selected} />;
    if (type === "previewSlot") return <PreviewSlotNode id={id} selected={selected} />;
    if (type === "note") return <NoteNode id={id} selected={selected} />;
    if (type === "todo") return <TodoNode id={id} selected={selected} />;
    if (type === "snippet") return <SnippetNode id={id} selected={selected} />;
    if (type === "file") return <FileNode id={id} selected={selected} />;
    if (type === "asset") return <AssetNode id={id} selected={selected} />;
    if (type === "gallery") return <NodeChrome id={id} title="Mediengalerie" selected={selected}><OrbitGalleryNode variant="media" /></NodeChrome>;
    if (type === "fileGallery") return <NodeChrome id={id} title="Dateigalerie" selected={selected}><OrbitGalleryNode variant="files" /></NodeChrome>;
    if (type === "usage") return <UsageNode id={id} selected={selected} />;
    if (type === "hermesStatus") return <HermesStatusNode id={id} selected={selected} />;
    if (type === "hermesTasks") return <HermesTasksNode id={id} selected={selected} />;
    if (type === "hermesCron") return <HermesCronNode id={id} selected={selected} />;
    if (type === "hermesResults") return <HermesResultsNode id={id} selected={selected} />;
    if (type === "frame") return <FrameNode id={id} selected={selected} />;
    if (type === "extension") return <ExtensionOrbitNode id={id} selected={selected} />;
    return null;
  }, [id, selected, type]);
  return <CodePluginSurface surface="orbit" target={type ?? "unknown"} context={{ selection: { id, type, selected } }} builtins={[{ id: `wrapt.orbit.node.${type ?? "unknown"}`, surface: "orbit", title: type ?? "Orbit-Knoten", children: content }]} />;
}

export const OrbitNodeView = memo(OrbitNodeComponent);
