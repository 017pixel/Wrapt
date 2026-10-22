import type { SidebarDropPlan, SidebarDropTarget, SidebarReorderIntent, SidebarRowView } from "./sidebar-types";

export function planSidebarDrop(row: SidebarRowView, target: SidebarDropTarget, pinned: readonly SidebarRowView[],
  complete: boolean, pinRevision: number, beforeSessionId?: string): SidebarDropPlan {
  if (!["pinned", "active", "settled"].includes(target)) return { allowed: false, reason: "Dieses Ziel ist nicht für manuelles Ablegen vorgesehen." };
  if (target === "pinned" && row.pinned) {
    if (!complete) return { allowed: false, reason: "Die vollständige Pin-Liste muss zuerst geladen werden." };
    if (beforeSessionId === row.id) return { allowed: false, reason: "Die Reihenfolge bleibt unverändert." };
    const ids = pinned.map((entry) => entry.id).filter((id) => id !== row.id);
    const index = beforeSessionId === undefined ? ids.length : ids.indexOf(beforeSessionId);
    if (index < 0) return { allowed: false, reason: "Das Pin-Ziel ist nicht mehr vorhanden." };
    ids.splice(index, 0, row.id);
    const revisions = new Map(pinned.map((entry) => [entry.id, entry.metadata.revision]));
    return { allowed: true, kind: "reorder", command: { expectedPinRevision: pinRevision,
      entries: ids.map((sessionId) => ({ sessionId, expectedRevision: revisions.get(sessionId)! })) } };
  }
  const action = target === "pinned" ? "pin" : target === "settled" ? "settle"
    : row.snoozedUntil !== null ? "wake" : row.settledAt !== null ? "unsettle" : row.pinned ? "unpin" : null;
  if (!action) return { allowed: false, reason: "Für diese Sitzung ist hier keine Organisationsänderung nötig." };
  return { allowed: true, kind: "action", command: { sessionId: row.id, expectedRevision: row.metadata.revision, action } };
}
export function validPinReorder(intent: SidebarReorderIntent, pinned: readonly SidebarRowView[], complete: boolean, revision: number): boolean {
  if (!complete || intent.expectedPinRevision !== revision || intent.entries.length !== pinned.length) return false;
  const expected = new Map(pinned.map((row) => [row.id, row.metadata.revision]));
  for (const entry of intent.entries) {
    if (expected.get(entry.sessionId) !== entry.expectedRevision) return false;
    expected.delete(entry.sessionId);
  }
  return expected.size === 0;
}
