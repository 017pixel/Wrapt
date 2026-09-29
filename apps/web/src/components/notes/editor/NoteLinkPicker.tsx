import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import type { NoteSummary } from "@wrapt/contracts";
import { wraptQueries } from "../../../lib/queryOptions";
import { useDismissible } from "../hooks/useDismissible.js";
import { NotePageIcon } from "../icons/NotePageIcon.js";
import { buildNotePathMap } from "../search/notesPaths.js";

interface NoteLinkPickerProps {
  open: boolean;
  currentNoteId: string;
  onClose: () => void;
  onPick: (note: NoteSummary) => void;
}

/** Suche und Auswahl interner Seitenverweise für den Slash-Befehl /link. */
export function NoteLinkPicker({ open, currentNoteId, onClose, onPick }: NoteLinkPickerProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listQuery = useQuery({ ...wraptQueries.notesList(), enabled: open });
  const notes = useMemo(() => listQuery.data?.notes ?? [], [listQuery.data]);
  const paths = useMemo(() => buildNotePathMap(notes), [notes]);
  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de");
    return notes
      .filter((note) => !note.archived && note.id !== currentNoteId)
      .filter((note) => {
        if (needle === "") return true;
        return `${note.title} ${paths.get(note.id) ?? ""}`.toLocaleLowerCase("de").includes(needle);
      })
      .sort((a, b) => a.title.localeCompare(b.title, "de"));
  }, [currentNoteId, notes, paths, query]);

  useDismissible({ open, onClose, rootRef });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => setIndex((value) => Math.min(value, Math.max(0, results.length - 1))), [results.length]);

  if (!open) return null;

  const choose = (note: NoteSummary) => {
    onPick(note);
    onClose();
  };

  return createPortal(
    <div className="note-link-picker-backdrop">
      <section
        ref={rootRef}
        className="note-link-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Seite verlinken"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div className="note-link-picker-head">
          <h2>Seite verlinken</h2>
          <button type="button" className="quiet-button" onClick={onClose}>Schließen</button>
        </div>
        <input
          ref={inputRef}
          value={query}
          placeholder="Seite suchen…"
          aria-label="Seite suchen"
          aria-controls="note-link-results"
          aria-activedescendant={results[index] ? `note-link-option-${index}` : undefined}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && results.length > 0) {
              event.preventDefault();
              setIndex((value) => Math.min(value + 1, results.length - 1));
            } else if (event.key === "ArrowUp" && results.length > 0) {
              event.preventDefault();
              setIndex((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter" && results[index]) {
              event.preventDefault();
              choose(results[index]);
            }
          }}
        />
        <div id="note-link-results" className="note-link-picker-results" role="listbox" aria-label="Seiten">
          {listQuery.isPending ? <p className="note-link-picker-empty">Seiten werden geladen…</p> : null}
          {listQuery.isError ? <p className="note-link-picker-empty">Seiten konnten nicht geladen werden.</p> : null}
          {!listQuery.isPending && results.length === 0 ? (
            <p className="note-link-picker-empty">Keine passende Seite gefunden.</p>
          ) : null}
          {results.map((note, itemIndex) => (
            <button
              id={`note-link-option-${itemIndex}`}
              key={note.id}
              type="button"
              role="option"
              aria-selected={itemIndex === index}
              className={`note-link-picker-option ${itemIndex === index ? "is-active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setIndex(itemIndex)}
              onClick={() => choose(note)}
            >
              <NotePageIcon name={note.icon} />
              <span><strong>{note.title}</strong>{paths.get(note.id) ? <small>{paths.get(note.id)}</small> : null}</span>
            </button>
          ))}
        </div>
      </section>
    </div>,
    document.body,
  );
}
