import { useEffect, useMemo, useRef, useState } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import { FolderIcon } from "../../icons";
import { useMediaQuery } from "../../../lib/useMediaQuery.js";
import { useDismissible } from "../hooks/useDismissible.js";
import { NotePageIcon } from "../icons/NotePageIcon.js";
import { collectDescendantIds } from "../notesTree.js";
import { buildSidebarTree, type SidebarTreeNode } from "./sidebarTree.js";
import { resolveMoveToParent, type NotesDropResult } from "./treeDrop.js";

interface NotesMoveDialogProps {
  note: NoteSummary;
  notes: readonly NoteSummary[];
  onClose: () => void;
  onMove: (noteId: string, drop: NotesDropResult) => void;
}

interface MoveTarget {
  id: string;
  title: string;
  icon: string | null;
  depth: number;
  /** Aktueller Elternteil: als Ziel gesperrt, nur zur Orientierung. */
  current: boolean;
}

/**
 * Verschieben ohne Ziehen: sichtbare Alternative für Touch-Geräte, auf denen
 * HTML5-Drag-and-Drop nicht greift. Auf dem Handy als Bottom Sheet, am
 * Schreibtisch als zentrierter Dialog.
 */
export function NotesMoveDialog({ note, notes, onClose, onMove }: NotesMoveDialogProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const [query, setQuery] = useState("");
  useDismissible({ open: true, onClose, rootRef });

  const targets = useMemo(() => {
    const excluded = new Set([note.id, ...collectDescendantIds(notes, note.id)]);
    const available = notes.filter((entry) => !entry.archived && !excluded.has(entry.id));
    const rows: MoveTarget[] = [];
    const walk = (nodes: SidebarTreeNode[], depth: number) => {
      for (const node of nodes) {
        rows.push({
          id: node.note.id,
          title: node.note.title,
          icon: node.note.icon,
          depth,
          current: note.parentId === node.note.id,
        });
        walk(node.children, depth + 1);
      }
    };
    walk(buildSidebarTree(available), 0);
    return rows;
  }, [note.id, note.parentId, notes]);

  const visibleTargets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return targets;
    return targets.filter((target) => target.title.toLowerCase().includes(needle));
  }, [query, targets]);

  const choose = (parentId: string | null) => {
    const result = resolveMoveToParent(notes, note.id, parentId);
    if (result !== null) onMove(note.id, result);
    onClose();
  };

  // Auf Touch-Geräten bleibt die Tastatur zu; stattdessen nimmt der Dialog
  // selbst den Fokus, damit Escape und Tab sofort funktionieren.
  useEffect(() => {
    if (coarsePointer) rootRef.current?.focus({ preventScroll: true });
  }, [coarsePointer]);

  return (
    <div className="notes-move-backdrop">
      <div
        ref={rootRef}
        className="notes-move-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${note.title} verschieben`}
        tabIndex={-1}
      >
        <div className="notes-move-head">
          <strong>Verschieben nach …</strong>
          <span>{note.title}</span>
        </div>
        <input
          className="notes-move-filter"
          value={query}
          placeholder="Seite suchen…"
          aria-label="Ziel suchen"
          autoFocus={!coarsePointer}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="notes-move-list">
          <button
            type="button"
            className="notes-move-row"
            data-target="root"
            onClick={() => choose(null)}
          >
            <FolderIcon aria-hidden />
            <span className="notes-move-row-label">Oberste Ebene</span>
          </button>
          {visibleTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              className="notes-move-row"
              style={{ paddingLeft: 10 + target.depth * 14 }}
              disabled={target.current}
              onClick={() => choose(target.id)}
            >
              <NotePageIcon name={target.icon} fallback="description" />
              <span className="notes-move-row-label">{target.title}</span>
              {target.current ? <span className="notes-move-row-hint">aktuell</span> : null}
            </button>
          ))}
          {visibleTargets.length === 0 ? (
            <p className="notes-move-empty">Keine Zielseite gefunden.</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
