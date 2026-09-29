import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import type { NoteSummary } from "@wrapt/contracts";
import { wraptQueries } from "../../../lib/queryOptions";
import { SearchIcon } from "../../icons";
import { useDismissible } from "../hooks/useDismissible.js";
import { NotePageIcon } from "../icons/NotePageIcon.js";
import { groupNotesByDate } from "./notesDateGroups.js";
import { formatNoteTimestamp } from "./notesFormat.js";
import { buildNotePathMap } from "./notesPaths.js";
import { NotesSearchFilters } from "./NotesSearchFilters.js";
import {
  defaultPaletteFilters,
  noteMatchesFilters,
  type NotesPaletteFilters,
} from "./paletteFilters.js";

interface NotesCommandPaletteProps {
  open: boolean;
  notes: readonly NoteSummary[];
  onClose: () => void;
  onSelect: (noteId: string) => void;
  onOpenWindow: (noteId: string) => void;
}

const RECENT_LIMIT = 30;

/** Befehlspalette (⌘K): Suche mit Filtern, Datumsgruppen und Vorschau. */
export function NotesCommandPalette({
  open,
  notes,
  onClose,
  onSelect,
  onOpenWindow,
}: NotesCommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filters, setFilters] = useState<NotesPaletteFilters>(defaultPaletteFilters);
  const [index, setIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useDismissible({ open, onClose, rootRef });

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setDebounced("");
    setFilters(defaultPaletteFilters);
    setIndex(0);
  }, [open]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searching = debounced !== "";
  const searchQuery = useQuery({
    ...wraptQueries.notesSearch({
      q: debounced,
      titleOnly: filters.titleOnly,
      ...(filters.scopeId === null ? {} : { scopeId: filters.scopeId }),
      createdWithin: filters.createdWithin,
      updatedWithin: filters.updatedWithin,
    }),
    enabled: open && searching,
  });

  const results = useMemo<NoteSummary[]>(() => {
    if (!open) return [];
    if (searching) return searchQuery.data?.notes ?? [];
    return notes
      .filter((note) => noteMatchesFilters(note, filters, notes))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, RECENT_LIMIT);
  }, [open, searching, searchQuery.data, notes, filters]);

  const groups = useMemo(() => groupNotesByDate(results), [results]);
  const flat = useMemo(() => groups.flatMap((group) => group.notes), [groups]);
  const selected = flat.length === 0 ? null : (flat[Math.min(index, flat.length - 1)] ?? null);
  const paths = useMemo(() => buildNotePathMap(notes), [notes]);

  useEffect(() => {
    setIndex(0);
  }, [debounced, filters]);

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  const openNote = useCallback(
    (note: NoteSummary | null, newWindow: boolean) => {
      if (!note) return;
      onClose();
      if (newWindow) onOpenWindow(note.id);
      else onSelect(note.id);
    },
    [onClose, onOpenWindow, onSelect],
  );

  if (!open) return null;

  // Portal an den Body: Nur so liegt die Palette über Topbar und App-Rahmen.
  return createPortal(
    <div className="notes-palette-backdrop">
      <div
        className="notes-palette"
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label="Notizen durchsuchen"
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((value) => Math.min(flat.length - 1, value + 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((value) => Math.max(0, value - 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            openNote(selected, event.metaKey || event.ctrlKey);
          }
        }}
      >
        <div className="notes-palette-head">
          <SearchIcon aria-hidden />
          <input
            autoFocus
            value={query}
            placeholder="Notizen durchsuchen…"
            aria-label="Notizen durchsuchen"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>Esc</kbd>
        </div>

        <NotesSearchFilters notes={notes} filters={filters} onChange={setFilters} />

        <div className="notes-palette-body">
          <div className="notes-palette-results" ref={listRef} role="listbox" aria-label="Treffer">
            {searching && searchQuery.isPending ? (
              <p className="notes-palette-note">Suche läuft…</p>
            ) : flat.length === 0 ? (
              <p className="notes-palette-note">
                {searching ? `Keine Treffer für „${debounced}“.` : "Keine Seiten gefunden."}
              </p>
            ) : (
              groups.map((group) => (
                <section key={group.id} className="notes-palette-group">
                  <p className="notes-palette-group-title">{group.label}</p>
                  {group.notes.map((note) => {
                    const flatIndex = flat.findIndex((item) => item.id === note.id);
                    return (
                      <button
                        key={note.id}
                        type="button"
                        role="option"
                        data-index={flatIndex}
                        aria-selected={selected?.id === note.id}
                        className={`notes-palette-item ${selected?.id === note.id ? "is-active" : ""}`}
                        onMouseMove={() => setIndex(flatIndex)}
                        onClick={() => openNote(note, false)}
                      >
                        <span className="notes-palette-item-icon">
                          <NotePageIcon name={note.icon} />
                        </span>
                        <span className="notes-palette-item-copy">
                          <span className="notes-palette-item-title">{note.title}</span>
                          {searching && note.excerpt !== "" ? (
                            <span className="notes-palette-item-excerpt">{note.excerpt}</span>
                          ) : (
                            <span className="notes-palette-item-excerpt">
                              {paths.get(note.id) === "" ? "Privat" : paths.get(note.id)}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </section>
              ))
            )}
          </div>

          <aside className="notes-palette-preview" aria-label="Vorschau">
            {selected === null ? (
              <p className="notes-palette-note">Keine Seite ausgewählt.</p>
            ) : (
              <>
                <div className="notes-palette-preview-head">
                  <span className="notes-palette-preview-icon">
                    <NotePageIcon name={selected.icon} />
                  </span>
                  <div className="notes-palette-preview-titles">
                    <p className="notes-palette-preview-title">{selected.title}</p>
                    <p className="notes-palette-preview-path">
                      {paths.get(selected.id) === "" ? "Privat" : paths.get(selected.id)}
                    </p>
                  </div>
                </div>
                <p className="notes-palette-preview-excerpt">
                  {selected.excerpt === "" ? "Leere Seite" : selected.excerpt}
                </p>
                <dl className="notes-palette-preview-meta">
                  <div>
                    <dt>Geändert</dt>
                    <dd>{formatNoteTimestamp(selected.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Erstellt</dt>
                    <dd>{formatNoteTimestamp(selected.createdAt)}</dd>
                  </div>
                </dl>
              </>
            )}
          </aside>
        </div>

        <div className="notes-palette-foot">
          <span>
            <kbd>↵</kbd> Öffnen
          </span>
          <span>
            <kbd>⌘↵</kbd> Neues Fenster
          </span>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Auswählen
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
