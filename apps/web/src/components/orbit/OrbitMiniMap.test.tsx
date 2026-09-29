import { describe, expect, it } from "vitest";
import { orbitNodeSchema, type OrbitNode } from "@wrapt/contracts";
import { sameOrbitMiniMapNodes } from "./OrbitMiniMap";

const nodes = [orbitNodeSchema.parse({
  id: "note-1",
  type: "note",
  title: "Notiz",
  position: { x: 8, y: 12 },
  size: { width: 300, height: 180 },
  projectId: null,
  parentId: null,
  runtimeId: null,
  toolType: null,
  previewId: null,
  previewTarget: null,
  provider: null,
  content: "Inhalt",
  language: null,
  locked: false,
  zIndex: 1,
})];

describe("OrbitMiniMapNodes", () => {
  it("überspringt neue Viewport-Geometrie und aktualisiert sich bei neuer Knotenliste", () => {
    expect(sameOrbitMiniMapNodes({ nodes }, { nodes })).toBe(true);
    expect(sameOrbitMiniMapNodes({ nodes }, { nodes: [...nodes] })).toBe(false);
    const moved: OrbitNode[] = [{ ...nodes[0]!, position: { x: 24, y: 32 } }];
    expect(sameOrbitMiniMapNodes({ nodes }, { nodes: moved })).toBe(false);
  });
});
