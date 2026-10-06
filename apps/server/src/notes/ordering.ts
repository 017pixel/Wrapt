import type { DatabaseSync } from "node:sqlite";
import type { MoveNoteRequest, Note } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

/** Normiert Geschwister atomar. Wiederholtes Ziehen erzeugt keine Bruchteile. */
export function moveNoteInOrder(db: DatabaseSync, id: string, input: MoveNoteRequest, update: () => Note): Note {
  db.exec("BEGIN IMMEDIATE");
  try {
    const moved = update();
    const siblings = db.prepare(`SELECT id FROM notes WHERE parent_id IS ? AND archived=0 AND id<>?
      ORDER BY sort_order, updated_at DESC, id`).all(moved.parentId, id) as { id: string }[];
    const index = input.beforeId === null ? siblings.length : siblings.findIndex((entry) => entry.id === input.beforeId);
    if (index < 0 || input.beforeId === id) {
      throw new AppError(400, "NOTE_ORDER_INVALID", "Die Zielseite gehört nicht zu dieser Ebene.");
    }
    siblings.splice(index, 0, { id });
    const statement = db.prepare("UPDATE notes SET sort_order=? WHERE id=?");
    siblings.forEach((entry, position) => statement.run(position + 1, entry.id));
    db.exec("COMMIT");
    return { ...moved, sortOrder: index + 1 };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
