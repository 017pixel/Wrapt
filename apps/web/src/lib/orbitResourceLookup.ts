import type { OrbitBoard, OrbitNode } from "@wrapt/contracts";
import { normalizePreviewTarget } from "./previewTargets";

export function findOrbitToolNodeByRuntimeId(
  boards: readonly OrbitBoard[],
  runtimeId: string,
): { board: OrbitBoard; node: OrbitNode } | null {
  for (const board of boards) {
    const node = board.nodes.find((candidate) => candidate.type === "tool" && candidate.runtimeId === runtimeId);
    if (node) return { board, node };
  }
  return null;
}

export function findOrbitPreviewNodeByTarget(
  boards: readonly OrbitBoard[],
  projectId: string,
  targetPort: number,
  path = "/",
): { board: OrbitBoard; node: OrbitNode } | null {
  const requested = normalizePreviewTarget(`${targetPort}${path}`);
  if (requested?.kind !== "local") return null;

  for (const board of boards) {
    const node = board.nodes.find((candidate) => {
      if (candidate.type !== "previewSlot" || candidate.projectId !== projectId) return false;
      const target = normalizePreviewTarget(candidate.previewTarget ?? "");
      if (target?.kind !== "local" || target.port !== requested.port) return false;
      const candidateTarget = normalizePreviewTarget(`${target.port}${candidate.previewPath}`);
      return candidateTarget?.kind === "local" && candidateTarget.path === requested.path;
    });
    if (node) return { board, node };
  }
  return null;
}
