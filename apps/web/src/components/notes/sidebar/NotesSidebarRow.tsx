import type { ReactNode } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import { MoreIcon } from "../../icons";
import { NotePageIcon } from "../icons/NotePageIcon.js";

interface NotesSidebarRowProps {
  note: NoteSummary;
  active: boolean;
  onSelect: () => void;
  /** Erzwingt ein Symbol, etwa den Ordner für Seiten mit Unterseiten. */
  iconFallback?: string;
  action?: ReactNode;
  trailing?: ReactNode;
  onOpenMenu?: (note: NoteSummary, anchor: DOMRect) => void;
}

/** Kompakte Zeile für Zuletzt verwendet, Favoriten und Papierkorb. */
export function NotesSidebarRow({
  note,
  active,
  onSelect,
  iconFallback,
  action,
  trailing,
  onOpenMenu,
}: NotesSidebarRowProps) {
  return (
    <div
      className={`notes-sidebar-row ${active ? "is-active" : ""}`}
      onContextMenu={(event) => {
        if (!onOpenMenu) return;
        event.preventDefault();
        onOpenMenu(note, event.currentTarget.getBoundingClientRect());
      }}
    >
      <button
        type="button"
        className="notes-sidebar-row-main"
        aria-current={active ? "page" : undefined}
        onClick={onSelect}
      >
        <span className="notes-sidebar-row-icon">
          <NotePageIcon name={note.icon} {...(iconFallback === undefined ? {} : { fallback: iconFallback })} />
        </span>
        <span className="notes-sidebar-row-label">{note.title}</span>
      </button>
      {trailing}
      {onOpenMenu ? (
        <button
          type="button"
          className="notes-sidebar-row-menu"
          aria-label={`Aktionen für ${note.title}`}
          aria-haspopup="menu"
          title="Seitenaktionen"
          onClick={(event) => onOpenMenu(note, event.currentTarget.getBoundingClientRect())}
        >
          <MoreIcon aria-hidden />
        </button>
      ) : null}
      {action}
    </div>
  );
}
