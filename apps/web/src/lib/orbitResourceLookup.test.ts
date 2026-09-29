import { describe, expect, it } from "vitest";
import type { OrbitBoard } from "@wrapt/contracts";
import { findOrbitToolNodeByRuntimeId } from "./orbitResourceLookup";

function board(id: string, runtimeId: string | null, type: "tool" | "note" = "tool"): OrbitBoard {
  return {
    id,
    name: id,
    viewport: { x: 0, y: 0, zoom: 1 },
    worldBounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    nodes: runtimeId === null ? [] : [{
      id: `${id}-node`,
      type,
      title: "Session",
      position: { x: 0, y: 0 },
      size: { width: 200, height: 100 },
      projectId: null,
      parentId: null,
      runtimeId,
      toolType: "terminal",
      previewId: null,
      previewLayout: null,
      previewTarget: null,
      previewPath: "/",
      previewDeviceId: null,
      previewOrientation: "portrait",
      previewSlotId: null,
      previewStorageProfileId: null,
      previewIsolation: true,
      previewReferenceId: null,
      previewLastUsedAt: null,
      assetId: null,
      assetMimeType: null,
      assetBytes: null,
      provider: null,
      content: "",
      language: null,
      color: null,
      hermesSourceFilter: "all",
      hermesStatusFilter: "all",
      extensionId: null,
      contributionId: null,
      stateVersion: null,
      state: {},
      noteId: null,
      locked: false,
      zIndex: 1,
    } as OrbitBoard["nodes"][number]],
    edges: [],
  };
}

describe("findOrbitToolNodeByRuntimeId", () => {
  it("findet eine Runtime über alle Boards hinweg", () => {
    const boards = [board("active", null), board("other", "runtime-1")];
    expect(findOrbitToolNodeByRuntimeId(boards, "runtime-1")).toMatchObject({
      board: { id: "other" },
      node: { id: "other-node", runtimeId: "runtime-1" },
    });
  });

  it("ignoriert Nodes ohne passende Tool-Runtime", () => {
    expect(findOrbitToolNodeByRuntimeId([board("note", "runtime-1", "note")], "runtime-1")).toBeNull();
    expect(findOrbitToolNodeByRuntimeId([board("tool", "runtime-2")], "runtime-1")).toBeNull();
  });
});
