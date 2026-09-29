import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { searchNotePageIcons } from "./notePageIcons.js";
import { NotePageIcon } from "./NotePageIcon.js";
import { useDismissible } from "../hooks/useDismissible.js";

interface IconPickerProps {
  onPick: (name: string) => void;
  onRemove?: () => void;
  onClose: () => void;
  anchor: HTMLElement | null;
}

/** Symbolauswahl für Seiten: Material Icons mit Suche, keine Emojis. */
export function IconPicker({ onPick, onRemove, onClose, anchor }: IconPickerProps) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const results = useMemo(() => searchNotePageIcons(query), [query]);

  useDismissible({ open: true, onClose, rootRef });

  useLayoutEffect(() => {
    if (!anchor) return;
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const above = Math.max(0, rect.top - viewportTop - 8);
      const below = Math.max(0, viewportTop + viewportHeight - rect.bottom - 8);
      const openAbove = below < 240 && above > below;
      const available = openAbove ? above : below;
      const maxHeight = Math.max(120, Math.min(340, available));
      const top = openAbove
        ? Math.max(viewportTop + 8, rect.top - maxHeight - 6)
        : Math.min(rect.bottom + 6, viewportTop + viewportHeight - maxHeight - 8);
      const width = Math.min(300, viewportWidth - 16);
      const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
      setPosition({ top, left, maxHeight });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [anchor]);

  return createPortal(
    <div
      ref={rootRef}
      className="notes-icon-popover"
      role="dialog"
      aria-label="Symbol wählen"
      style={{
        top: position?.top ?? 8,
        left: position?.left ?? 8,
        maxHeight: position?.maxHeight ?? 120,
        visibility: position === null ? "hidden" : "visible",
      }}
    >
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Symbol suchen…"
        aria-label="Symbol suchen"
      />
      {results.length === 0 ? (
        <p className="notes-group-empty">Nichts gefunden.</p>
      ) : (
        <div className="notes-icon-grid">
          {results.map((icon) => (
            <button
              key={icon.name}
              type="button"
              aria-label={icon.label}
              title={icon.label}
              onClick={() => {
                onPick(icon.name);
                onClose();
              }}
            >
              <NotePageIcon name={icon.name} />
            </button>
          ))}
        </div>
      )}
      {onRemove ? (
        <button
          type="button"
          className="notes-icon-remove"
          onClick={() => {
            onRemove();
            onClose();
          }}
        >
          Symbol entfernen
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
