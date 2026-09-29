export interface OrbitFocusRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OrbitFocusViewportInput {
  node: OrbitFocusRect;
  viewport: { width: number; height: number };
  insets: { top: number; right: number; bottom: number; left: number };
  worldBounds: { minX: number; minY: number; maxX: number; maxY: number };
  minZoom: number;
  maxZoom: number;
}

export interface OrbitFocusViewport {
  x: number;
  y: number;
  zoom: number;
}

const VISIBLE_AREA_RATIO = 0.9;

function clampTranslation(value: number, lower: number, upper: number): number {
  return lower <= upper ? Math.max(lower, Math.min(upper, value)) : (lower + upper) / 2;
}

/** Zentriert einen Knoten im nutzbaren Canvas und lässt nach Möglichkeit fünf Prozent Rand. */
export function calculateOrbitFocusViewport(input: OrbitFocusViewportInput): OrbitFocusViewport {
  const safe = {
    left: Math.max(0, input.insets.left),
    top: Math.max(0, input.insets.top),
    right: Math.max(0, input.viewport.width - input.insets.right),
    bottom: Math.max(0, input.viewport.height - input.insets.bottom),
  };
  const availableWidth = Math.max(1, safe.right - safe.left);
  const availableHeight = Math.max(1, safe.bottom - safe.top);
  const nodeWidth = Math.max(1, input.node.width);
  const nodeHeight = Math.max(1, input.node.height);
  const zoom = Math.max(input.minZoom, Math.min(
    input.maxZoom,
    availableWidth * VISIBLE_AREA_RATIO / nodeWidth,
    availableHeight * VISIBLE_AREA_RATIO / nodeHeight,
  ));
  const centerX = input.node.x + nodeWidth / 2;
  const centerY = input.node.y + nodeHeight / 2;
  const focusX = safe.left + availableWidth / 2 - centerX * zoom;
  const focusY = safe.top + availableHeight / 2 - centerY * zoom;
  const minX = safe.right - input.worldBounds.maxX * zoom;
  const maxX = safe.left - input.worldBounds.minX * zoom;
  const minY = safe.bottom - input.worldBounds.maxY * zoom;
  const maxY = safe.top - input.worldBounds.minY * zoom;
  return {
    x: clampTranslation(focusX, minX, maxX),
    y: clampTranslation(focusY, minY, maxY),
    zoom,
  };
}
