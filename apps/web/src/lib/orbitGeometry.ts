import type { OrbitNode } from "@wrapt/contracts";

type Geometry = Pick<OrbitNode, "id" | "type" | "parentId" | "position" | "size">;

/** Alle Edges teilen dieselbe unveränderte Hindernissicht bei Contentupdates. */
export function createOrbitGeometrySelector() {
  const cache = new WeakMap<readonly OrbitNode[], Geometry[]>();
  let previous: Geometry[] = [];
  return (nodes: readonly OrbitNode[]): Geometry[] => {
    const cached = cache.get(nodes);
    if (cached) return cached;
    const unchanged = nodes.length === previous.length && nodes.every((node, index) => {
      const old = previous[index]!;
      return node.id === old.id && node.type === old.type && node.parentId === old.parentId
        && node.position.x === old.position.x && node.position.y === old.position.y
        && node.size.width === old.size.width && node.size.height === old.size.height;
    });
    if (!unchanged) previous = nodes.map(({ id, type, parentId, position, size }) => ({ id, type, parentId, position, size }));
    cache.set(nodes, previous);
    return previous;
  };
}

export const selectOrbitGeometry = createOrbitGeometrySelector();
