import { useRef } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import {
  BookmarkIcon,
  CopyIcon,
  EditIcon,
  FolderTreeIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
} from "../../icons";
import { useDismissible } from "../hooks/useDismissible.js";

interface NotesItemMenuProps {
  note: NoteSummary;
  anchor: DOMRect;
  onClose: () => void;
  onSelect: (noteId: string) => void;
  onCreateSubpage: (parentId: string) => void;
  onRename: (noteId: string) => void;
  onMove: (note: NoteSummary) => void;
  onToggleFavorite: (note: NoteSummary) => void;
  onDuplicate: (note: NoteSummary) => void;
  onCopyLink: (note: NoteSummary) => void;
  onArchive: (note: NoteSummary) => void;
}

/** Kontextmenü einer Seite in der Seitenleiste. */
export function NotesItemMenu({
  note,
  anchor,
  onClose,
  onSelect,
  onCreateSubpage,
  onRename,
  onMove,
  onToggleFavorite,
  onDuplicate,
  onCopyLink,
  onArchive,
}: NotesItemMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissible({ open: true, onClose, rootRef });

  const style = {
    top: Math.min(anchor.bottom + 4, Math.max(8, window.innerHeight - 390)),
    left: Math.min(anchor.left, Math.max(8, window.innerWidth - 260)),
  };

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      ref={rootRef}
      className="notes-item-menu"
      role="menu"
      aria-label={`Aktionen für ${note.title}`}
      style={style}
    >
      <button type="button" role="menuitem" onClick={run(() => onSelect(note.id))}>
        <EditIcon aria-hidden /> Öffnen
      </button>
      <button type="button" role="menuitem" onClick={run(() => onCreateSubpage(note.id))}>
        <PlusIcon aria-hidden /> Unterseite
      </button>
      <button type="button" role="menuitem" onClick={run(() => onRename(note.id))}>
        <EditIcon aria-hidden /> Umbenennen
      </button>
      <button type="button" role="menuitem" onClick={run(() => onMove(note))}>
        <FolderTreeIcon aria-hidden /> Verschieben nach …
      </button>
      <button type="button" role="menuitem" onClick={run(() => onToggleFavorite(note))}>
        <BookmarkIcon aria-hidden fill={note.favorite ? "currentColor" : "none"} />
        {note.favorite ? "Aus Favoriten entfernen" : "Zu Favoriten"}
      </button>
      <button type="button" role="menuitem" onClick={run(() => onDuplicate(note))}>
        <CopyIcon aria-hidden /> Duplizieren
      </button>
      <button type="button" role="menuitem" onClick={run(() => onCopyLink(note))}>
        <LinkIcon aria-hidden /> Link kopieren
      </button>
      <button
        type="button"
        role="menuitem"
        className="is-danger"
        onClick={run(() => onArchive(note))}
      >
        <TrashIcon aria-hidden /> In den Papierkorb
      </button>
    </div>
  );
}
