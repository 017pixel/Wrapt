import type { OrbitBoard, OrbitNode, Project } from "@wrapt/contracts";

export function resolveOrbitProjectId(
  payloadProjectId: string | undefined,
  focusedProjectId: string | null | undefined,
  selectedProjectId: string | null,
  nearbyProjectId: string | null | undefined,
): string | null {
  return payloadProjectId ?? focusedProjectId ?? selectedProjectId ?? nearbyProjectId ?? null;
}

const projectBoundOrbitToolTypes = new Set<OrbitNode["toolType"]>(["code-server", "preview"]);

export function resolveOrbitToolProjectBinding(
  node: OrbitNode,
  board: Pick<OrbitBoard, "nodes">,
  focusedNode: OrbitNode | undefined,
  selectedProjectId: string | null,
  projects: readonly Project[],
): { projectId: string | null; previewId?: string | null } | null {
  if (node.type !== "tool" || !projectBoundOrbitToolTypes.has(node.toolType)) return null;

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const availableProjectIds = new Set(projects
    .filter((project) => project.availability === "available")
    .map((project) => project.id));
  const projectId = node.projectId && projectById.has(node.projectId)
    ? node.projectId
    : resolveOrbitProjectId(
      undefined,
      focusedNode?.projectId && availableProjectIds.has(focusedNode.projectId) ? focusedNode.projectId : null,
      selectedProjectId && availableProjectIds.has(selectedProjectId) ? selectedProjectId : null,
      board.nodes
        .filter((candidate) => candidate.type === "project" && candidate.projectId !== null && availableProjectIds.has(candidate.projectId))
        .map((candidate) => ({
          projectId: candidate.projectId!,
          distance: Math.hypot(
            candidate.position.x + candidate.size.width / 2 - node.position.x - node.size.width / 2,
            candidate.position.y + candidate.size.height / 2 - node.position.y - node.size.height / 2,
          ),
        }))
        .sort((left, right) => left.distance - right.distance)
        .find((candidate) => candidate.distance < 620)?.projectId ?? null,
    );

  if (node.toolType !== "preview") return { projectId };
  const previews = projectId ? projectById.get(projectId)?.previews ?? [] : [];
  const previewId = previews.some((preview) => preview.id === node.previewId)
    ? node.previewId
    : previews[0]?.id ?? null;
  return { projectId, previewId };
}
