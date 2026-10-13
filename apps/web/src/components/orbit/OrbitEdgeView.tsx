import { memo, useEffect, useMemo, useRef, useState } from "react";
import "./OrbitEdgeView.css";
import { BaseEdge, EdgeLabelRenderer, useStore, type EdgeProps } from "@xyflow/react";
import type { OrbitEdge } from "@wrapt/contracts";
import { collisionFreeEdgeLabelPoint } from "../../lib/orbitEdgeLabel";
import { useOrbitStore } from "../../stores/orbit";
import { selectOrbitGeometry } from "../../lib/orbitGeometry";

type Point = { x: number; y: number };
type OrbitFlowEdgeData = { orbit: OrbitEdge; color: string };

function compactPoints(points: Point[]): Point[] {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous && Math.abs(previous.x - point.x) < .1 && Math.abs(previous.y - point.y) < .1) continue;
    result.push(point);
  }
  return result;
}

function orthogonalRoute(source: Point, target: Point, waypoints: Point[], sourceSide: "left" | "right") {
  if (waypoints.length > 0) {
    const anchors = [source, ...waypoints, target];
    const routed: Point[] = [anchors[0]!];
    for (let index = 1; index < anchors.length; index += 1) {
      const from = routed.at(-1)!;
      const to = anchors[index]!;
      if (Math.abs(from.x - to.x) > .1 && Math.abs(from.y - to.y) > .1) {
        const horizontalFirst = index % 2 === 1;
        routed.push(horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y });
      }
      routed.push(to);
    }
    return compactPoints(routed);
  }
  const direction = sourceSide === "right" ? 1 : -1;
  const facing = direction > 0 ? source.x <= target.x : source.x >= target.x;
  if (facing) {
    const middleX = (source.x + target.x) / 2;
    return compactPoints([source, { x: middleX, y: source.y }, { x: middleX, y: target.y }, target]);
  }
  const detourX = source.x + direction * Math.max(64, Math.min(180, Math.abs(target.x - source.x) * .25 + 48));
  return compactPoints([source, { x: detourX, y: source.y }, { x: detourX, y: target.y }, target]);
}

function roundedPath(points: Point[], radius = 10) {
  if (points.length < 2) return "";
  let path = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const next = points[index + 1]!;
    const incoming = Math.hypot(current.x - previous.x, current.y - previous.y);
    const outgoing = Math.hypot(next.x - current.x, next.y - current.y);
    const bend = Math.min(radius, incoming / 2, outgoing / 2);
    const before = { x: current.x + ((previous.x - current.x) / incoming) * bend, y: current.y + ((previous.y - current.y) / incoming) * bend };
    const after = { x: current.x + ((next.x - current.x) / outgoing) * bend, y: current.y + ((next.y - current.y) / outgoing) * bend };
    path += ` L ${before.x} ${before.y} Q ${current.x} ${current.y} ${after.x} ${after.y}`;
  }
  const last = points.at(-1)!;
  return `${path} L ${last.x} ${last.y}`;
}

function lengthOf(points: Point[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += Math.hypot(points[index]!.x - points[index - 1]!.x, points[index]!.y - points[index - 1]!.y);
  return total;
}

function pointAtDistance(points: Point[], wanted: number) {
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const segment = Math.hypot(to.x - from.x, to.y - from.y);
    if (travelled + segment >= wanted) {
      const ratio = segment === 0 ? 0 : (wanted - travelled) / segment;
      return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
    }
    travelled += segment;
  }
  return points.at(-1)!;
}

function sampledControls(points: Point[]) {
  const total = lengthOf(points);
  const count = Math.min(32, Math.max(0, Math.floor(total / 100)));
  return Array.from({ length: count }, (_, index) => pointAtDistance(points, Math.min(total - 24, (index + 1) * total / (count + 1))));
}

function OrbitEdgeComponent({ id, sourceX, sourceY, targetX, targetY, selected, markerEnd, style, data }: EdgeProps) {
  const payload = data as OrbitFlowEdgeData | undefined;
  const edge = payload?.orbit;
  const updateEdge = useOrbitStore((state) => state.updateEdge);
  const nodes = useOrbitStore((state) => selectOrbitGeometry(state.document.boards.find((board) => board.id === state.document.activeBoardId)?.nodes ?? []));
  const viewportZoom = useStore((state) => state.transform[2]);
  const [dragPoints, setDragPoints] = useState<Point[] | null>(null);
  const [dragging, setDragging] = useState(false);
  const zoomRef = useRef(viewportZoom);
  zoomRef.current = viewportZoom;
  const dragRef = useRef<{ index: number; origin: Point; clientX: number; clientY: number; pointerId: number } | null>(null);
  const pointsRef = useRef<Point[] | null>(null);
  const sourceSide = edge?.sourceSide ?? (sourceX <= targetX ? "right" : "left");
  const route = useMemo(() => orthogonalRoute(
    { x: sourceX, y: sourceY },
    { x: targetX, y: targetY },
    dragPoints ?? edge?.waypoints ?? [],
    sourceSide,
  ), [dragPoints, edge?.waypoints, sourceSide, sourceX, sourceY, targetX, targetY]);
  const path = useMemo(() => roundedPath(route), [route]);
  const controls = useMemo(() => dragPoints ?? sampledControls(route), [dragPoints, route]);
  const labelPoint = useMemo(() => collisionFreeEdgeLabelPoint(route, edge?.label ?? "", nodes), [edge?.label, nodes, route]);

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      const drag = dragRef.current;
      const current = pointsRef.current;
      if (!drag || !current || event.pointerId !== drag.pointerId) return;
      const next = current.map((point, index) => index === drag.index ? {
        x: drag.origin.x + (event.clientX - drag.clientX) / zoomRef.current,
        y: drag.origin.y + (event.clientY - drag.clientY) / zoomRef.current,
      } : point);
      pointsRef.current = next;
      setDragPoints(next);
    };
    const clear = () => {
      dragRef.current = null;
      pointsRef.current = null;
      setDragPoints(null);
      setDragging(false);
    };
    const up = (event: PointerEvent) => {
      if (!dragRef.current || !pointsRef.current) return;
      if (event.pointerId !== dragRef.current.pointerId) return;
      updateEdge(id, { waypoints: pointsRef.current.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })) });
      clear();
    };
    const cancel = (event: PointerEvent) => { if (event.pointerId === dragRef.current?.pointerId) clear(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); clear(); } };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
  }, [dragging, id, updateEdge]);

  if (!edge) return null;
  return (
    <>
      <BaseEdge id={id} path={path} {...(markerEnd ? { markerEnd } : {})} {...(style ? { style } : {})} interactionWidth={22} />
      {edge.label ? <EdgeLabelRenderer><span className="orbit-edge-label nodrag nopan" style={{ transform: `translate(-50%, -50%) translate(${labelPoint.x}px, ${labelPoint.y}px)` }}>{edge.label}</span></EdgeLabelRenderer> : null}
      {selected && edge.kind === "manual" ? <EdgeLabelRenderer>{controls.map((point, index) => (
        <button
          type="button"
          key={index}
          className="orbit-edge-waypoint nodrag nopan"
          style={{ transform: `translate(${point.x}px, ${point.y}px) scale(${1 / viewportZoom}) translate(-50%, -50%)`, pointerEvents: "all" }}
          aria-label={`Linienpunkt ${index + 1} verschieben`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            const initial = controls.map((control) => ({ ...control }));
            dragRef.current = { index, origin: initial[index]!, clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId };
            pointsRef.current = initial;
            setDragPoints(initial);
            setDragging(true);
          }}
          onLostPointerCapture={(event) => {
            if (dragRef.current?.pointerId !== event.pointerId) return;
            dragRef.current = null;
            pointsRef.current = null;
            setDragPoints(null);
            setDragging(false);
          }}
        ><span className="orbit-edge-waypoint-dot" aria-hidden /></button>
      ))}</EdgeLabelRenderer> : null}
    </>
  );
}

export const OrbitEdgeView = memo(OrbitEdgeComponent);
