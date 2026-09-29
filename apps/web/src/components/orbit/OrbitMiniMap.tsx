import { memo, useEffect, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { useReactFlow, useViewport } from "@xyflow/react";
import type { OrbitBoard, OrbitNode } from "@wrapt/contracts";

const MINIMAP_WIDTH = 144;
const MINIMAP_HEIGHT = 94;
const minimapTokens: Record<string, string> = {};

export function orbitMinimapToken(name: string, fallback: string): string {
  if (!minimapTokens[name]) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    minimapTokens[name] = value || fallback;
  }
  return minimapTokens[name];
}

function minimapNodeColor(type: OrbitNode["type"]): string {
  if (type === "project") return orbitMinimapToken("--orbit-minimap-project", "#6686a5");
  if (type === "usage" || type === "hermesStatus" || type === "hermesTasks" || type === "hermesCron" || type === "hermesResults") {
    return orbitMinimapToken("--orbit-minimap-usage", "#719b77");
  }
  if (type === "frame") return orbitMinimapToken("--orbit-minimap-frame", "#4c4c4c");
  return orbitMinimapToken("--orbit-minimap-tool", "#8a8a84");
}

interface OrbitMiniMapNodesProps { nodes: readonly OrbitNode[] }

export function sameOrbitMiniMapNodes(previous: OrbitMiniMapNodesProps, next: OrbitMiniMapNodesProps): boolean {
  return previous.nodes === next.nodes;
}

const OrbitMiniMapNodes = memo(function OrbitMiniMapNodes({ nodes }: OrbitMiniMapNodesProps) {
  return <>{nodes.map((node) => <rect
    key={node.id}
    className="orbit-minimap-node"
    x={node.position.x}
    y={node.position.y}
    width={node.size.width}
    height={node.size.height}
    rx={Math.min(24, node.size.width * .05)}
    fill={minimapNodeColor(node.type)}
  />)}</>;
}, sameOrbitMiniMapNodes);

export function OrbitMiniMap({ board, wrapper }: { board: OrbitBoard; wrapper: RefObject<HTMLDivElement | null> }) {
  const viewport = useViewport();
  const reactFlow = useReactFlow();
  const [canvasSize, setCanvasSize] = useState({ width: 1_280, height: 720 });

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const update = () => setCanvasSize({ width: element.clientWidth || 1_280, height: element.clientHeight || 720 });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [wrapper]);

  const zoom = Math.max(.1, viewport.zoom);
  const visible = {
    x: -viewport.x / zoom,
    y: -viewport.y / zoom,
    width: canvasSize.width / zoom,
    height: canvasSize.height / zoom,
  };
  const center = { x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 };
  const radarAspect = MINIMAP_WIDTH / MINIMAP_HEIGHT;
  let radarWidth = Math.max(1_800, visible.width * 2.55);
  let radarHeight = radarWidth / radarAspect;
  if (radarHeight < visible.height * 2.55) {
    radarHeight = visible.height * 2.55;
    radarWidth = radarHeight * radarAspect;
  }
  const radar = { x: center.x - radarWidth / 2, y: center.y - radarHeight / 2, width: radarWidth, height: radarHeight };

  const panFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = radar.x + ((event.clientX - bounds.left) / bounds.width) * radar.width;
    const y = radar.y + ((event.clientY - bounds.top) / bounds.height) * radar.height;
    void reactFlow.setCenter(x, y, { zoom: viewport.zoom, duration: event.type === "pointerdown" ? 120 : 0 });
  };

  return <div
    className="orbit-minimap nodrag nowheel"
    role="application"
    tabIndex={0}
    aria-label="Zentrierte Minimap. Ziehen zum Navigieren, Mausrad zum Zoomen."
    onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); panFromPointer(event); }}
    onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) panFromPointer(event); }}
    onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
    onWheel={(event) => { event.preventDefault(); if (event.deltaY < 0) void reactFlow.zoomIn({ duration: 120 }); else void reactFlow.zoomOut({ duration: 120 }); }}
    onKeyDown={(event) => {
      const distance = 80 / zoom;
      if (event.key === "+" || event.key === "=") { event.preventDefault(); void reactFlow.zoomIn({ duration: 120 }); }
      if (event.key === "-") { event.preventDefault(); void reactFlow.zoomOut({ duration: 120 }); }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const x = center.x + (event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0);
        const y = center.y + (event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0);
        void reactFlow.setCenter(x, y, { zoom: viewport.zoom, duration: 120 });
      }
    }}
  >
    <svg viewBox={`${radar.x} ${radar.y} ${radar.width} ${radar.height}`} aria-hidden="true" preserveAspectRatio="none">
      <rect className="orbit-minimap-surface" x={radar.x} y={radar.y} width={radar.width} height={radar.height} />
      <OrbitMiniMapNodes nodes={board.nodes} />
      <rect data-testid="orbit-minimap-viewport" className="orbit-minimap-viewport" x={visible.x} y={visible.y} width={visible.width} height={visible.height} />
      <line className="orbit-minimap-center" x1={center.x - radar.width * .025} x2={center.x + radar.width * .025} y1={center.y} y2={center.y} />
      <line className="orbit-minimap-center" x1={center.x} x2={center.x} y1={center.y - radar.height * .038} y2={center.y + radar.height * .038} />
    </svg>
  </div>;
}
