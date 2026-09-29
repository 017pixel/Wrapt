import { describe, expect, it } from "vitest";
import { calculateOrbitFocusViewport } from "./orbitFocusViewport";

const base = {
  viewport: { width: 1000, height: 700 },
  insets: { top: 100, right: 200, bottom: 80, left: 20 },
  worldBounds: { minX: -2_000, minY: -2_000, maxX: 2_000, maxY: 2_000 },
  minZoom: .1,
  maxZoom: 2.2,
};

describe("calculateOrbitFocusViewport", () => {
  it("fits a node within 90 percent of the usable area and centers it", () => {
    const viewport = calculateOrbitFocusViewport({ ...base, node: { x: 0, y: 0, width: 400, height: 240 } });
    expect(viewport.zoom).toBeCloseTo(1.755);
    expect(viewport.x + 200 * viewport.zoom).toBeCloseTo(410);
    expect(viewport.y + 120 * viewport.zoom).toBeCloseTo(360);
  });

  it("respects zoom limits and keeps edge nodes inside board bounds", () => {
    const viewport = calculateOrbitFocusViewport({
      ...base,
      maxZoom: 1.5,
      worldBounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
      node: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect(viewport.zoom).toBe(1.5);
    expect(viewport.x).toBeLessThanOrEqual(20);
    expect(viewport.y).toBeLessThanOrEqual(100);
  });
});
