import type { OrbitDatabase } from "../orbit/database.js";
import type { NotesDatabase } from "./database.js";

/**
 * Überführt vorhandene Orbit-Notizen und To-do-Listen atomar in Notes.
 * Die Migrationstabelle enthält je Quelle eine stabile Zuordnung und den
 * unveränderten Quelltext. Ein fehlgeschlagener Lauf lässt beide Quellen stehen.
 */
export function migrateOrbitNotesToNotes(
  orbit: OrbitDatabase,
  notes: NotesDatabase,
): { migratedNodes: number; migratedTodos: number; migratedBoards: number } {
  const migrated = notes.migrateOrbitSources();
  const current = orbit.get();
  if (migrated.revision !== null && current.revision !== migrated.revision) {
    throw new Error("Die Orbit-Notes-Migration konnte die gespeicherte Revision nicht verifizieren.");
  }

  for (const reference of migrated.references) {
    const board = current.document.boards.find((candidate) => candidate.id === reference.boardId);
    const node = board?.nodes.find((candidate) => candidate.id === reference.nodeId);
    const note = notes.get(reference.noteId);
    if (note?.parentId !== null) {
      throw new Error(`Die globale Notes-Notiz für Orbit-Quelle ${reference.nodeId} konnte nicht verifiziert werden.`);
    }
    if (reference.sourceType === "note" && (node?.type !== "note" || node.noteId !== reference.noteId)) {
      throw new Error(`Die Notes-Referenz für Orbit-Notiz ${reference.nodeId} konnte nicht verifiziert werden.`);
    }
    if (reference.sourceType === "todo" && (node || board?.edges.some((edge) => edge.source === reference.nodeId || edge.target === reference.nodeId))) {
      throw new Error(`Der migrierte To-do-Knoten ${reference.nodeId} wurde nicht aus Orbit entfernt.`);
    }
  }

  return {
    migratedNodes: migrated.migratedNotes,
    migratedTodos: migrated.migratedTodos,
    migratedBoards: migrated.migratedBoards,
  };
}
