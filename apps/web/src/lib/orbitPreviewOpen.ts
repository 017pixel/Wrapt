import type { OrbitBoard, OrbitNode } from "@wrapt/contracts";
import type { OrbitPalettePayload } from "./orbitPalette";
import { findOrbitPreviewNodeByTarget } from "./orbitResourceLookup";
import { normalizePreviewTarget } from "./previewTargets";

interface PreviewTargetContext {
  boards: readonly OrbitBoard[];
  activeBoardId: string;
  activateBoard: (boardId: string) => void;
  focusNodeInCanvas: (nodeId: string) => void;
  updateNode: (nodeId: string, patch: Partial<Omit<OrbitNode, "id" | "type">>) => void;
  scheduleFocus: (focus: () => void) => void;
  create: (target: {
    projectId: string; title: string; previewId: string | null; port: number; path: string;
    previewSlotId?: number | null; previewStorageProfileId?: string | null; previewIsolation: boolean;
  }) => void;
}

export function openOrbitPreviewTarget(payload: OrbitPalettePayload, context: PreviewTargetContext): "focused" | "created" | "invalid" {
  if (payload.type !== "previewTarget" || !payload.projectId || !Number.isInteger(payload.targetPort)) return "invalid";
  const target = normalizePreviewTarget(`${payload.targetPort}${payload.previewPath ?? "/"}`);
  if (target?.kind !== "local") return "invalid";

  const existing = findOrbitPreviewNodeByTarget(context.boards, payload.projectId, target.port, target.path);
  if (existing) {
    const focus = () => {
      const patch: Partial<Omit<OrbitNode, "id" | "type">> = {};
      const storageProfileChanged = payload.previewStorageProfileId !== undefined
        && payload.previewStorageProfileId !== existing.node.previewStorageProfileId;
      const isolationChanged = payload.previewIsolation !== undefined
        && payload.previewIsolation !== existing.node.previewIsolation;
      if (storageProfileChanged) patch.previewStorageProfileId = payload.previewStorageProfileId ?? null;
      if (isolationChanged) patch.previewIsolation = payload.previewIsolation ?? existing.node.previewIsolation;
      if (storageProfileChanged || isolationChanged) {
        if (existing.node.previewSlotId !== null) patch.previewSlotId = null;
      } else if (payload.previewSlotId !== undefined && payload.previewSlotId !== existing.node.previewSlotId) {
        patch.previewSlotId = payload.previewSlotId;
      }
      if (Object.keys(patch).length > 0) context.updateNode(existing.node.id, patch);
      context.focusNodeInCanvas(existing.node.id);
    };
    if (existing.board.id !== context.activeBoardId) {
      context.activateBoard(existing.board.id);
      context.scheduleFocus(focus);
    } else focus();
    return "focused";
  }
  context.create({
    projectId: payload.projectId,
    title: payload.title,
    previewId: payload.previewId ?? null,
    port: target.port,
    path: target.path,
    ...(payload.previewSlotId !== undefined ? { previewSlotId: payload.previewSlotId } : {}),
    ...(payload.previewStorageProfileId !== undefined ? { previewStorageProfileId: payload.previewStorageProfileId } : {}),
    ...(payload.previewIsolation !== undefined ? { previewIsolation: payload.previewIsolation } : { previewIsolation: true }),
  });
  return "created";
}
