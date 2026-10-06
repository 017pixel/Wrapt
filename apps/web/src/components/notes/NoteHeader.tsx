import { useCallback, useRef, useState } from "react";
import type { Note, NoteSummary } from "@wrapt/contracts";
import {
  BookmarkIcon,
  ChevronLeftIcon,
  CopyIcon,
  ExternalLinkIcon,
  LayoutPanelIcon,
  MoreIcon,
  PlusIcon,
  RestoreIcon,
  TrashIcon,
} from "../icons";
import { useDismissible } from "./hooks/useDismissible.js";
import { useMediaQuery } from "../../lib/useMediaQuery.js";
import { noteSaveStateLabels, type NoteSaveState } from "./editor/useNoteAutosave.js";

interface NoteHeaderProps {
  note: Note;
  ancestors: NoteSummary[];
  saveState: NoteSaveState;
  /** Eigenständiges Fenster: statt Seitenleiste erscheint der Sprung in die Übersicht. */
  windowMode?: boolean;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onSelectAncestor: (noteId: string) => void;
  onToggleFavorite: () => void;
  onArchive: () => void;
  onCreateSubpage: () => void;
  onOpenWindow: () => void;
  onCopyLink: () => void;
  onOpenOverview?: () => void;
}

/** Kopfzeile einer Seite: Seitenleiste, Pfad, Speicherstand und Aktionen. */
export function NoteHeader({
  note,
  ancestors,
  saveState,
  windowMode = false,
  sidebarCollapsed,
  mobileSidebarOpen,
  onToggleSidebar,
  onSelectAncestor,
  onToggleFavorite,
  onArchive,
  onCreateSubpage,
  onOpenWindow,
  onCopyLink,
  onOpenOverview,
}: NoteHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissible({ open: menuOpen, onClose: () => setMenuOpen(false), rootRef: menuRef });
  // Auf dem Handy ist die Seitenleiste eine Schublade: Der Knopf zeigt ihren
  // offenen Zustand, nicht die eingeklappte Desktop-Spalte.
  const isDrawer = useMediaQuery("(max-width: 900px)");
  const sidebarOpen = isDrawer ? mobileSidebarOpen : !sidebarCollapsed;
  const sidebarTitle = isDrawer
    ? sidebarOpen ? "Seitenleiste schließen" : "Seitenleiste öffnen"
    : sidebarCollapsed ? "Seitenleiste öffnen (⌘\\)" : "Seitenleiste einklappen (⌘\\)";

  const runMenuAction = useCallback((action: () => void) => {
    setMenuOpen(false);
    action();
  }, []);

  return (
    <header className="notes-note-head">
      {windowMode ? (
        <button
          type="button"
          className="notes-icon-button"
          aria-label="Notizen-Übersicht öffnen"
          title="Zur Übersicht"
          onClick={onOpenOverview}
        >
          <RestoreIcon />
        </button>
      ) : (
        <button
          type="button"
          className={`notes-icon-button ${sidebarOpen ? "is-active" : ""}`}
          aria-label={sidebarOpen ? "Seitenleiste schließen" : "Seitenleiste öffnen"}
          aria-pressed={sidebarOpen}
          title={sidebarTitle}
          onClick={onToggleSidebar}
        >
          {isDrawer ? <ChevronLeftIcon style={{ color: "currentColor" }} /> : <LayoutPanelIcon />}
        </button>
      )}

      <nav className="notes-note-crumbs" aria-label="Pfad" data-has-ancestors={ancestors.length > 0}>
        {[...ancestors].reverse().map((ancestor, index) => (
          <span
            key={ancestor.id}
            className={`notes-note-crumb ${index === ancestors.length - 1 ? "is-nearest" : ""}`}
          >
            <button type="button" onClick={() => onSelectAncestor(ancestor.id)}>
              {ancestor.title}
            </button>
            <span className="notes-note-crumb-sep" aria-hidden>
              /
            </span>
          </span>
        ))}
        <span className="notes-note-current" title={note.title}>{note.title}</span>
        <span className="notes-save-state" data-state={saveState} role="status">
          {noteSaveStateLabels[saveState]}
        </span>
      </nav>

      <div className="notes-head-actions">
        <button
          type="button"
          className="notes-icon-button notes-subpage-action"
          aria-label="Unterseite erstellen"
          title="Unterseite erstellen"
          onClick={onCreateSubpage}
        >
          <PlusIcon style={{ color: "currentColor" }} />
        </button>
        <button
          type="button"
          className={`notes-icon-button notes-favorite ${note.favorite ? "is-active" : ""}`}
          aria-label={note.favorite ? "Favorit entfernen" : "Als Favorit markieren"}
          aria-pressed={note.favorite}
          title={note.favorite ? "Favorit entfernen" : "Als Favorit markieren"}
          onClick={onToggleFavorite}
        >
          <BookmarkIcon fill={note.favorite ? "currentColor" : "none"} style={{ color: "currentColor" }} />
        </button>
        <div className="notes-head-menu" ref={menuRef}>
          <button
            type="button"
            className="notes-icon-button"
            aria-label="Weitere Aktionen"
            aria-expanded={menuOpen}
            title="Weitere Aktionen"
            data-dismiss-ignore
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreIcon style={{ color: "currentColor" }} />
          </button>
          {menuOpen ? (
            <div className="notes-head-popover" role="menu">
              <button
                type="button"
                role="menuitem"
                className="notes-mobile-subpage-action"
                onClick={() => runMenuAction(onCreateSubpage)}
              >
                <PlusIcon aria-hidden /> Unterseite erstellen
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => runMenuAction(onOpenWindow)}
              >
                <ExternalLinkIcon aria-hidden /> In neuem Fenster öffnen
              </button>
              <button type="button" role="menuitem" onClick={() => runMenuAction(onCopyLink)}>
                <CopyIcon aria-hidden /> Link kopieren
              </button>
              <button
                type="button"
                role="menuitem"
                className="is-danger"
                onClick={() => runMenuAction(onArchive)}
              >
                <TrashIcon aria-hidden /> In den Papierkorb
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
