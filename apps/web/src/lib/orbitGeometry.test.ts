import { expect, it } from "vitest";
import type { OrbitNode } from "@wrapt/contracts";
import { createOrbitGeometrySelector } from "./orbitGeometry";

const node = { id: "a", type: "snippet", parentId: null, position: { x: 0, y: 0 }, size: { width: 200, height: 100 } } as OrbitNode;
it("behält bei Content und Titel dieselbe Hindernissicht für 600 Nodes", () => {
  const select = createOrbitGeometrySelector();
  const nodes = Array.from({ length: 600 }, (_, index) => ({ ...node, id: String(index) }));
  const geometry = select(nodes);
  expect(select(nodes)).toBe(geometry);
  expect(select(nodes.map((item) => ({ ...item, title: "Neu", content: "Text" })))).toBe(geometry);
});
it.each(["position", "size", "parentId", "type"] as const)("invalidiert bei %s und Wiederherstellung", (field) => {
  const select = createOrbitGeometrySelector();
  const first = select([node]);
  const changed = { ...node, [field]: field === "position" ? { x: 50, y: 0 } : field === "size" ? { width: 300, height: 100 } : field === "parentId" ? "rahmen" : "frame" } as OrbitNode;
  expect(select([changed])).not.toBe(first);
  expect(select([node])).not.toBe(first);
});
