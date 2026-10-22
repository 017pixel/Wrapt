import { createContext, useContext, type ReactNode } from "react";
import { Handle, NodeResizeControl, Position } from "@xyflow/react";
import { ORBIT_SIZE_LIMITS, type LocalPortsResponse, type OrbitNode, type Project, type Service } from "@wrapt/contracts";
import { useOrbitStore } from "../../stores/orbit";
import { FocusNodeAction, focusFromHeader } from "./OrbitNodeFocusAction";

export interface OrbitNodeRuntimeData {
  projects: Project[];
  services: Service[];
  localPorts: LocalPortsResponse | null;
  localPortsLoading: boolean;
  localPortsError: boolean;
  refreshLocalPorts: () => Promise<unknown>;
}

export const emptyOrbitNodeRuntime: OrbitNodeRuntimeData = {
  projects: [],
  services: [],
  localPorts: null,
  localPortsLoading: false,
  localPortsError: false,
  refreshLocalPorts: async () => undefined,
};

export const OrbitNodeRuntimeContext = createContext<OrbitNodeRuntimeData>(emptyOrbitNodeRuntime);

export function OrbitNodeRuntimeProvider({ data, children }: { data: OrbitNodeRuntimeData; children: ReactNode }) {
  return <OrbitNodeRuntimeContext.Provider value={data}>{children}</OrbitNodeRuntimeContext.Provider>;
}

export function useOrbitNodeRuntime(): OrbitNodeRuntimeData {
  return useContext(OrbitNodeRuntimeContext);
}

export const activeNodeMapCache = new WeakMap<readonly OrbitNode[], ReadonlyMap<string, OrbitNode>>();

export const projectNodeCountCache = new WeakMap<readonly OrbitNode[], ReadonlyMap<string, number>>();

export function nodeMap(nodes: readonly OrbitNode[]): ReadonlyMap<string, OrbitNode> {
  const cached = activeNodeMapCache.get(nodes);
  if (cached) return cached;
  const map = new Map(nodes.map((node) => [node.id, node] as const));
  activeNodeMapCache.set(nodes, map);
  return map;
}

export function projectNodeCounts(nodes: readonly OrbitNode[]): ReadonlyMap<string, number> {
  const cached = projectNodeCountCache.get(nodes);
  if (cached) return cached;
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (!node.projectId) continue;
    counts.set(node.projectId, (counts.get(node.projectId) ?? 0) + 1);
  }
  projectNodeCountCache.set(nodes, counts);
  return counts;
}

export function useActiveOrbitNode(id: string): OrbitNode | undefined {
  return useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board ? nodeMap(board.nodes).get(id) : undefined;
  });
}

export const resizeCorners = [
  "top-left", "top", "top-right",
  "left", "right",
  "bottom-left", "bottom", "bottom-right",
] as const;

export function EdgeHandles({ frame = false }: { frame?: boolean }) {
  const className = `orbit-handle${frame ? " orbit-frame-handle" : ""}`;
  // Die Griffe sitzen bewusst nicht in der Seitenmitte: Dort liegen die
  // Resize-Punkte (z-index 24) über dem Handle (z-index 18) und fingen
  // jeden Verbindungs-Drag ab. 30 % bzw. 70 % liegen frei davon.
  return <><Handle id="left" type="source" position={Position.Left} style={{ top: "30%" }} className={className} /><Handle id="right" type="source" position={Position.Right} style={{ top: "70%" }} className={className} /></>;
}

export function OrbitNodeResizer({
  id,
  selected,
  minWidth,
  minHeight,
}: {
  id: string;
  selected: boolean;
  minWidth: number;
  minHeight: number;
}) {
  if (!selected) return null;
  return resizeCorners.map((position) => (
    <NodeResizeControl
      key={position}
      nodeId={id}
      position={position}
      minWidth={Math.max(minWidth, ORBIT_SIZE_LIMITS.minWidth)}
      minHeight={Math.max(minHeight, ORBIT_SIZE_LIMITS.minHeight)}
      maxWidth={ORBIT_SIZE_LIMITS.maxWidth}
      maxHeight={ORBIT_SIZE_LIMITS.maxHeight}
      className="orbit-resize-corner"
      onResizeEnd={(_event, params) => useOrbitStore.getState().updateNode(id, {
        position: { x: params.x, y: params.y },
        size: { width: params.width, height: params.height },
      })}
    >
      <span className="orbit-resize-dot" aria-hidden />
    </NodeResizeControl>
  ));
}

export function NodeChrome({ id, title, children, selected, resizable = true }: { id: string; title: string; children: React.ReactNode; selected: boolean; resizable?: boolean }) {
  return (
    <div className={`orbit-node-shell ${selected ? "is-selected" : ""}`}>
      {resizable ? <OrbitNodeResizer id={id} selected={selected} minWidth={160} minHeight={96} /> : null}
      <header className="orbit-node-header orbit-node-drag-handle" onDoubleClick={(event) => focusFromHeader(event, id)}>
        <strong>{title}</strong>
        <FocusNodeAction id={id} />
      </header>
      <div className="orbit-node-content nodrag nopan nowheel">{children}</div>
      <EdgeHandles />
    </div>
  );
}
