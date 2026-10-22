import { MarkerType, type Edge as FlowEdge, type Node as FlowNode } from "@xyflow/react";
import type { OrbitBoard, OrbitNode } from "@wrapt/contracts";
import { createOrbitBoardIndex, type OrbitBoardIndex } from "./orbitBoardIndex";
import { nearestEdgeSides, orbitEdgeColor } from "./orbitAppearance";
import { expandedOrbitBounds, orbitBoundsEqual } from "./orbitTerritory";
import { freeOrbitPosition } from "./orbitPlacement";
import { previewSlotGeometry, useOrbitStore } from "../stores/orbit";
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export type FlowGeometry = {
  position: { x: number; y: number };
  size: { width: number; height: number };
};

export function viewportsEqual(left: OrbitBoard["viewport"], right: OrbitBoard["viewport"]) {
  return Math.abs(left.x - right.x) <= .01
    && Math.abs(left.y - right.y) <= .01
    && Math.abs(left.zoom - right.zoom) <= .001;
}

export function flowNode(
  node: OrbitNode,
  focusedNodeId: string | null,
  interactive = true,
  board?: OrbitBoard,
  geometryOverrides?: ReadonlyMap<string, FlowGeometry>,
  index?: OrbitBoardIndex,
): FlowNode {
  const ownGeometry = geometryOverrides?.get(node.id);
  const boardIndex = board ? index ?? createOrbitBoardIndex(board) : undefined;
  const parent = node.parentId ? boardIndex?.nodesById.get(node.parentId) : undefined;
  const parentGeometry = parent ? geometryOverrides?.get(parent.id) : undefined;
  const layoutParent = parent && parentGeometry ? { ...parent, position: parentGeometry.position, size: parentGeometry.size } : parent;
  const siblings = parent ? (boardIndex?.previewSlotsByParent.get(parent.id) ?? []) : [];
  const childIndex = parent ? siblings.findIndex((candidate) => candidate.id === node.id) : -1;
  const geometry = ownGeometry ?? (layoutParent && childIndex >= 0 ? previewSlotGeometry(layoutParent, childIndex) : { position: node.position, size: node.size });
  const activeSlots = parent ? Number(parent.previewLayout ?? "1") : 0;
  return {
    id: node.id,
    type: "orbit",
    position: geometry.position,
    data: {},
    width: geometry.size.width,
    height: geometry.size.height,
    style: { width: geometry.size.width, height: geometry.size.height, zIndex: node.type === "frame" || node.type === "previewGroup" ? 0 : Math.max(1, node.zIndex) },
    ...(node.parentId ? { parentId: node.parentId } : {}),
    hidden: childIndex >= activeSlots && childIndex >= 0,
    dragHandle: ".orbit-node-drag-handle",
    draggable: !node.locked && interactive,
    selectable: interactive,
    selected: node.id === focusedNodeId,
  };
}

export function geometryFromFlowNode(node: FlowNode): FlowGeometry | null {
  const width = node.width ?? node.measured?.width;
  const height = node.height ?? node.measured?.height;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { position: node.position, size: { width: width!, height: height! } };
}

export function flowEdge(edge: OrbitBoard["edges"][number], nodesById: ReadonlyMap<string, OrbitNode>): FlowEdge {
  const color = orbitEdgeColor(edge, nodesById);
  const automaticSides = nearestEdgeSides(nodesById.get(edge.source), nodesById.get(edge.target));
  const sourceSide = edge.sourceSide ?? automaticSides.sourceSide;
  const targetSide = edge.targetSide ?? automaticSides.targetSide;
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: sourceSide,
    targetHandle: targetSide,
    type: "orbit",
    data: { orbit: { ...edge, sourceSide, targetSide }, color },
    ...(edge.kind === "manual" ? { markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color } } : {}),
    style: {
      stroke: color,
      strokeWidth: edge.kind === "project" ? 1.8 : 1.4,
      ...(edge.kind === "manual" ? { strokeDasharray: "6 6" } : {}),
    },
  };
}

export function nearestProject(board: OrbitBoard, position: { x: number; y: number }) {
  return board.nodes
    .filter((node) => node.type === "project" && node.projectId !== null)
    .map((node) => ({ node, distance: Math.hypot(node.position.x + node.size.width / 2 - position.x, node.position.y + node.size.height / 2 - position.y) }))
    .sort((left, right) => left.distance - right.distance)[0];
}

export function freePosition(
  board: OrbitBoard,
  desiredCenter: { x: number; y: number },
  size: { width: number; height: number },
) {
  const position = freeOrbitPosition(board, desiredCenter, size);
  const bounds = expandedOrbitBounds(board.worldBounds, { position, size });
  if (!orbitBoundsEqual(bounds, board.worldBounds)) useOrbitStore.getState().setWorldBounds(bounds);
  return position;
}

export function projectOrbitCenter(board: OrbitBoard, projectId: string | null, fallback: { x: number; y: number }, size: { width: number; height: number }) {
  if (!projectId) return fallback;
  const hub = board.nodes.find((node) => node.type === "project" && node.projectId === projectId);
  if (!hub) return fallback;
  const relatedCount = board.nodes.filter((node) => node.type !== "project" && node.projectId === projectId).length;
  const angle = relatedCount * GOLDEN_ANGLE - Math.PI / 2;
  const radiusX = Math.max(460, hub.size.width / 2 + size.width / 2 + 112);
  const radiusY = Math.max(330, hub.size.height / 2 + size.height / 2 + 88);
  return {
    x: hub.position.x + hub.size.width / 2 + Math.cos(angle) * radiusX,
    y: hub.position.y + hub.size.height / 2 + Math.sin(angle) * radiusY,
  };
}

export function dragPoint(event: MouseEvent | TouchEvent) {
  if ("touches" in event) {
    const touch = event.touches[0] ?? event.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  return { x: event.clientX, y: event.clientY };
}

export function orbitNodeIdAtPoint(point: { x: number; y: number }, excludedId: string) {
  return [...globalThis.document.querySelectorAll<HTMLElement>(".react-flow__node-orbit")]
    .filter((element) => element.dataset.id !== excludedId)
    .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
    .filter(({ bounds }) => point.x >= bounds.left && point.x <= bounds.right && point.y >= bounds.top && point.y <= bounds.bottom)
    .sort((left, right) => left.bounds.width * left.bounds.height - right.bounds.width * right.bounds.height)
    .map(({ element }) => element.dataset.id)
    .find((id): id is string => Boolean(id)) ?? null;
}

export function containsOrbitPoint(rectangle: { position: { x: number; y: number }; size: { width: number; height: number } }, point: { x: number; y: number }) {
  return point.x >= rectangle.position.x
    && point.x <= rectangle.position.x + rectangle.size.width
    && point.y >= rectangle.position.y
    && point.y <= rectangle.position.y + rectangle.size.height;
}

