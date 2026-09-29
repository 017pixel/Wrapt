import type { OrbitNode } from "@wrapt/contracts";
import { normalizePreviewTarget } from "./previewTargets";
import { orbitPreviewSessionKey } from "./previewWindow";

type OrbitPreviewNode = Pick<OrbitNode, "projectId" | "previewTarget" | "previewPath" | "previewStorageProfileId">;

export function orbitPreviewIdentity(node: OrbitPreviewNode) {
  const target = normalizePreviewTarget(node.previewTarget ?? "");
  const previewTarget = target?.kind === "local" ? `${target.port}${node.previewPath}` : node.previewTarget ?? "";
  return { projectId: node.projectId, previewTarget, storageProfileId: node.previewStorageProfileId };
}

export function orbitPreviewSessionKeyForNode(node: OrbitPreviewNode): string {
  return orbitPreviewSessionKey(orbitPreviewIdentity(node));
}
