import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import { ChevronRightIcon, MoreIcon, PlusIcon } from "../../icons";
import { NotePageIcon } from "../icons/NotePageIcon.js";
import { NOTE_DRAG_TYPE } from "./NotesDragContext.js";
import type { NotesDropZone } from "./treeDrop.js";

export interface NotesTreeActions {
  onToggle: (noteId: string) => void;
  onSelect: (noteId: string) => void;
  onCreateSubpage: (parentId: string) => void;
  onStartRename: (noteId: string) => void;
  onCommitRename: (noteId: string, title: string) => void;
  onCancelRename: () => void;
  onOpenMenu: (note: NoteSummary, anchor: DOMRect) => void;
  onDragStart: (noteId: string) => void;
  onDragEnd: () => void;
  onDragOverRow: (event: DragEvent<HTMLDivElement>, noteId: string) => void;
  onDropRow: (event: DragEvent<HTMLDivElement>, noteId: string) => void;
}

interface NotesTreeItemProps {
  note: NoteSummary;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  active: boolean;
  renaming: boolean;
  dragging: boolean;
  dropZone: NotesDropZone | null;
  actions: NotesTreeActions;
  children?: React.ReactNode;
}

/** Eine Zeile im Seitenbaum: Aufklappen, Auswählen, Umbenennen, Aktionen, Ziehen. */
export function NotesTreeItem({
  note,
  depth,
  hasChildren,
  expanded,
  active,
  renaming,
  dragging,
  dropZone,
  actions,
  children,
}: NotesTreeItemProps) {
  const [draft, setDraft] = useState(note.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) return;
    setDraft(note.title);
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [renaming, note.title]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed !== "" && trimmed !== note.title) actions.onCommitRename(note.id, trimmed);
    else actions.onCancelRename();
  };

  const rowClass = [
    "notes-tree-row",
    active ? "is-active" : "",
    dragging ? "is-dragging" : "",
    dropZone ? `is-drop-${dropZone}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="notes-tree-node">
      <div
        className={rowClass}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!renaming}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData(NOTE_DRAG_TYPE, note.id);
          actions.onDragStart(note.id);
        }}
        onDragEnd={actions.onDragEnd}
        onDragOver={(event) => actions.onDragOverRow(event, note.id)}
        onDrop={(event) => actions.onDropRow(event, note.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          actions.onOpenMenu(note, event.currentTarget.getBoundingClientRect());
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="notes-tree-toggle"
            aria-label={expanded ? "Einklappen" : "Ausklappen"}
            aria-expanded={expanded}
            onClick={() => actions.onToggle(note.id)}
          >
            <ChevronRightIcon className={expanded ? "is-expanded" : ""} aria-hidden />
          </button>
        ) : (
          <span className="notes-tree-toggle is-placeholder" aria-hidden />
        )}
        {renaming ? (
          <input
            ref={inputRef}
            className="notes-tree-rename"
            value={draft}
            aria-label="Seitentitel"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") actions.onCancelRename();
            }}
          />
        ) : (
          <button
            type="button"
            className="notes-tree-main"
            aria-current={active ? "page" : undefined}
            onClick={() => actions.onSelect(note.id)}
            onDoubleClick={() => actions.onStartRename(note.id)}
          >
            <span className="notes-tree-icon">
              <NotePageIcon
                name={note.icon}
                fallback={hasChildren ? "folder_open" : "description"}
              />
            </span>
            <span className="notes-tree-label">{note.title}</span>
          </button>
        )}
        {!renaming ? (
          <span className="notes-tree-actions">
            <button
              type="button"
              className="notes-tree-action"
              aria-label="Unterseite erstellen"
              title="Unterseite erstellen"
              onClick={() => actions.onCreateSubpage(note.id)}
            >
              <PlusIcon aria-hidden />
            </button>
            <button
              type="button"
              className="notes-tree-action"
              aria-label="Seitenaktionen"
              title="Seitenaktionen"
              onClick={(event) =>
                actions.onOpenMenu(note, event.currentTarget.getBoundingClientRect())
              }
            >
              <MoreIcon aria-hidden />
            </button>
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
