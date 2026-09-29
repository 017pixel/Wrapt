import type { OrbitBoard, OrbitNode } from "@wrapt/contracts";

const PLACEMENT_PADDING = 48;

interface Point { x: number; y: number }
interface Size { width: number; height: number }

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function nearestFreeX(nodes: OrbitNode[], y: number, size: Size, desiredX: number, minX: number, maxX: number) {
  const blocked = nodes
    .filter((node) => y < node.position.y + node.size.height + PLACEMENT_PADDING
      && y + size.height + PLACEMENT_PADDING > node.position.y)
    .map((node) => ({
      start: node.position.x - size.width - PLACEMENT_PADDING,
      end: node.position.x + node.size.width + PLACEMENT_PADDING,
    }))
    .sort((left, right) => left.start - right.start);

  let nextFree = minX;
  let nearest: number | null = null;
  for (const interval of blocked) {
    if (interval.start >= nextFree) {
      const candidate = clamp(desiredX, nextFree, Math.min(maxX, interval.start));
      if (candidate >= nextFree && candidate <= maxX
        && (nearest === null || Math.abs(candidate - desiredX) < Math.abs(nearest - desiredX))) nearest = candidate;
    }
    nextFree = Math.max(nextFree, interval.end);
    if (nextFree > maxX) break;
  }
  if (nextFree <= maxX) {
    const candidate = clamp(desiredX, nextFree, maxX);
    if (nearest === null || Math.abs(candidate - desiredX) < Math.abs(nearest - desiredX)) nearest = candidate;
  }
  return nearest;
}

/** Wählt die freie Position, deren Mittelpunkt dem gewünschten Punkt am nächsten liegt. */
export function freeOrbitPosition(board: OrbitBoard, desiredCenter: Point, size: Size): Point {
  // Preview-Slots haben relative Koordinaten innerhalb ihrer Gruppe. Nur die
  // äußere Gruppe darf bei der Platzierung als Hindernis zählen.
  const nodes = board.nodes.filter((node) => !node.parentId && node.type !== "frame");
  const desired = { x: desiredCenter.x - size.width / 2, y: desiredCenter.y - size.height / 2 };
  const minX = board.worldBounds.minX;
  const maxX = board.worldBounds.maxX - size.width;
  const minY = board.worldBounds.minY;
  const maxY = board.worldBounds.maxY - size.height;
  let best: Point | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  if (maxX >= minX && maxY >= minY) {
    const rows = [clamp(desired.y, minY, maxY), minY, maxY];
    for (const node of nodes) {
      rows.push(clamp(node.position.y - size.height - PLACEMENT_PADDING, minY, maxY));
      rows.push(clamp(node.position.y + node.size.height + PLACEMENT_PADDING, minY, maxY));
    }
    for (const y of new Set(rows)) {
      const x = nearestFreeX(nodes, y, size, clamp(desired.x, minX, maxX), minX, maxX);
      if (x === null) continue;
      const distance = (x - desired.x) ** 2 + (y - desired.y) ** 2;
      if (distance < bestDistance) { best = { x, y }; bestDistance = distance; }
    }
  }
  if (best) return best;

  // Ein voll belegtes Gebiet wächst nach rechts; die neue Karte landet nie
  // ungeprüft auf einer bestehenden Karte.
  return {
    x: Math.max(board.worldBounds.maxX + PLACEMENT_PADDING,
      ...nodes.map((node) => node.position.x + node.size.width + PLACEMENT_PADDING)),
    y: clamp(desired.y, minY, Math.max(minY, maxY)),
  };
}
