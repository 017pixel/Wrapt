import { describe, expect, it } from "vitest";
import { orbitDefaultNodeSize, nodeFromInput } from "../stores/orbitNodeFactory";
import { freshOrbitWorkspace, previewGroupSize } from "../stores/orbit";
import { expandedOrbitBounds } from "./orbitTerritory";
import { freeOrbitPosition } from "./orbitPlacement";

function collides(
  left: { position: { x: number; y: number }; size: { width: number; height: number } },
  right: { position: { x: number; y: number }; size: { width: number; height: number } },
) {
  return left.position.x < right.position.x + right.size.width + 48
    && left.position.x + left.size.width + 48 > right.position.x
    && left.position.y < right.position.y + right.size.height + 48
    && left.position.y + left.size.height + 48 > right.position.y;
}

describe("Orbit-Kartenplatzierung", () => {
  it("verteilt vier Palette-Klicks mit tatsächlichen Kartengrößen ohne Überdeckung", () => {
    let board = freshOrbitWorkspace().boards[0]!;
    let center = { x: 0, y: 0 };
    const cards = [
      { type: "note" as const, size: orbitDefaultNodeSize("note") },
      { type: "todo" as const, size: orbitDefaultNodeSize("todo") },
      { type: "snippet" as const, size: orbitDefaultNodeSize("snippet") },
      { type: "previewGroup" as const, size: previewGroupSize("2") },
    ];

    for (const card of cards) {
      const position = freeOrbitPosition(board, center, card.size);
      const node = nodeFromInput({ type: card.type, title: card.type, position, size: card.size }, board.nodes.length + 1);
      expect(board.nodes.every((existing) => !collides(node, existing))).toBe(true);
      board = { ...board, nodes: [...board.nodes, node] };
      center = { x: position.x + card.size.width / 2, y: position.y + card.size.height / 2 };
    }
    expect(board.nodes[3]!.position).not.toEqual(board.nodes[2]!.position);
  });

  it("weicht bei vollem Gebiet nach außen aus und kann das Gebiet erweitern", () => {
    const base = freshOrbitWorkspace().boards[0]!;
    const existing = nodeFromInput({ type: "frame", title: "Rahmen", position: { x: -1_600, y: -1_000 } }, 1);
    const blocker = nodeFromInput({ type: "previewGroup", title: "Groß", position: { x: -1_600, y: -1_000 }, size: { width: 3_200, height: 2_000 } }, 2);
    const board = { ...base, nodes: [existing, blocker] };
    const size = orbitDefaultNodeSize("note");
    const position = freeOrbitPosition(board, { x: 0, y: 0 }, size);
    expect(collides({ position, size }, blocker)).toBe(false);
    expect(expandedOrbitBounds(board.worldBounds, { position, size }).maxX).toBeGreaterThan(position.x + size.width);
  });

  it("ignoriert relative Preview-Slots und prüft die äußere Gruppe", () => {
    const base = freshOrbitWorkspace().boards[0]!;
    const group = nodeFromInput({ type: "previewGroup", title: "Gruppe", position: { x: 0, y: 0 }, size: previewGroupSize("2") }, 1);
    const child = nodeFromInput({ type: "previewSlot", title: "Slot", position: { x: 8, y: 52 }, parentId: group.id }, 2);
    const board = { ...base, nodes: [group, child] };
    const size = orbitDefaultNodeSize("note");
    const position = freeOrbitPosition(board, { x: 0, y: 0 }, size);
    expect(collides({ position, size }, group)).toBe(false);
  });
});
