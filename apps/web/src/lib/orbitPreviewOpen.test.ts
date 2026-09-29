import { describe, expect, it, vi } from "vitest";
import type { OrbitBoard, OrbitNode } from "@wrapt/contracts";
import { nodeFromInput } from "../stores/orbitNodeFactory";
import type { OrbitPalettePayload } from "./orbitPalette";
import { openOrbitPreviewTarget } from "./orbitPreviewOpen";

function board(id: string, nodes: OrbitNode[] = []): OrbitBoard {
  return {
    id,
    name: id,
    viewport: { x: 0, y: 0, zoom: 1 },
    worldBounds: { minX: -1_000, minY: -1_000, maxX: 1_000, maxY: 1_000 },
    nodes,
    edges: [],
  };
}

function previewNode(id: string, port: number, path: string, boardIndex: number): OrbitNode {
  return {
    ...nodeFromInput({
      type: "previewSlot",
      title: "Frontend",
      position: { x: 0, y: 0 },
      projectId: "demo-app",
      previewTarget: String(port),
      previewPath: path,
      previewId: "frontend",
      previewSlotId: 7,
      previewStorageProfileId: "storage-profile-existing",
    }, boardIndex),
    id,
  };
}

const payload: OrbitPalettePayload = {
  type: "previewTarget",
  title: "Frontend",
  projectId: "demo-app",
  previewId: "frontend",
  targetPort: 4173,
  previewPath: "/admin",
  previewStorageProfileId: null,
  previewIsolation: false,
};

function context(boards: OrbitBoard[], activeBoardId = "active") {
  return {
    boards,
    activeBoardId,
    activateBoard: vi.fn(),
    focusNodeInCanvas: vi.fn(),
    updateNode: vi.fn((id: string, patch: Partial<Omit<OrbitNode, "id" | "type">>) => {
      const node = boards.flatMap((candidate) => candidate.nodes).find((candidate) => candidate.id === id);
      if (node) Object.assign(node, patch);
    }),
    scheduleFocus: (focus: () => void) => focus(),
    create: vi.fn(),
  };
}

describe("Orbit-Übergabe von Preview-Zielen", () => {
  it("bewahrt ein explizit geteiltes Storageprofil statt ein isoliertes Profil zu erzeugen", () => {
    const node = nodeFromInput({
      type: "previewSlot",
      title: "Frontend",
      position: { x: 0, y: 0 },
      projectId: "demo-app",
      previewTarget: "4173",
      previewStorageProfileId: null,
      previewIsolation: false,
    }, 0);

    expect(node.previewStorageProfileId).toBeNull();
    expect(node.previewIsolation).toBe(false);
  });

  it("legt Projekt, Zielpfad und Preview-ID als neuen Slot-Kontext an", () => {
    const handlers = context([board("main")]);

    const result = openOrbitPreviewTarget(payload, handlers);

    expect(result).toBe("created");
    expect(handlers.create).toHaveBeenCalledWith({
      projectId: "demo-app",
      title: "Frontend",
      previewId: "frontend",
      port: 4173,
      path: "/admin",
      previewStorageProfileId: null,
      previewIsolation: false,
    });
    expect(handlers.focusNodeInCanvas).not.toHaveBeenCalled();
  });

  it("verknüpft einen vorhandenen Slot mit der Hub-Session und fokussiert ihn erneut ohne Neuanlage", () => {
    const existing = previewNode("preview-node", 4173, "/admin", 2);
    const boards = [board("active"), board("other", [existing])];
    const handlers = context(boards);

    expect(openOrbitPreviewTarget(payload, handlers)).toBe("focused");
    expect(openOrbitPreviewTarget(payload, handlers)).toBe("focused");

    expect(handlers.create).not.toHaveBeenCalled();
    expect(handlers.activateBoard).toHaveBeenCalledWith("other");
    expect(handlers.focusNodeInCanvas).toHaveBeenCalledTimes(2);
    expect(handlers.updateNode).toHaveBeenCalledOnce();
    expect(handlers.updateNode).toHaveBeenCalledWith("preview-node", {
      previewStorageProfileId: null,
      previewIsolation: false,
      previewSlotId: null,
    });
    expect(existing).toMatchObject({
      id: "preview-node",
      previewSlotId: null,
      previewStorageProfileId: null,
      previewIsolation: false,
    });
  });

  it("lehnt ungültige oder externe Preview-Ziele ab", () => {
    const handlers = context([board("main")]);

    expect(openOrbitPreviewTarget({ ...payload, targetPort: 70_000 }, handlers)).toBe("invalid");
    expect(openOrbitPreviewTarget({ type: "previewTarget", title: "Frontend", targetPort: 4173 }, handlers)).toBe("invalid");
    expect(handlers.create).not.toHaveBeenCalled();
  });
});
