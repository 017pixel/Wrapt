import { useRef, useState, type ReactNode } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import { CheckIcon, ChevronDownIcon } from "../../icons";
import { useDismissible } from "../hooks/useDismissible.js";
import { NotePageIcon } from "../icons/NotePageIcon.js";
import {
  notesRangeLabels,
  notesRangeOptions,
  type NotesPaletteFilters,
} from "./paletteFilters.js";

interface NotesSearchFiltersProps {
  notes: readonly NoteSummary[];
  filters: NotesPaletteFilters;
  onChange: (filters: NotesPaletteFilters) => void;
}

type PopoverId = "scope" | "created" | "updated" | null;

/** Filterzeile der Suche: nur Titel, Seitenbereich, Erstellt- und Änderungszeitraum. */
export function NotesSearchFilters({ notes, filters, onChange }: NotesSearchFiltersProps) {
  const [popover, setPopover] = useState<PopoverId>(null);
  const scopeTitle =
    filters.scopeId === null
      ? "Auf Seiten"
      : (notes.find((note) => note.id === filters.scopeId)?.title ?? "Auf Seiten");

  const toggle = (id: PopoverId) => setPopover((current) => (current === id ? null : id));
  const close = () => setPopover(null);

  return (
    <div className="notes-filter-row">
      <button
        type="button"
        className={`notes-filter-chip ${filters.titleOnly ? "is-active" : ""}`}
        aria-pressed={filters.titleOnly}
        onClick={() => onChange({ ...filters, titleOnly: !filters.titleOnly })}
      >
        <span className="notes-filter-glyph" aria-hidden>
          Aa
        </span>
        Nur Titel durchsuchen
      </button>

      <FilterPopover
        label={scopeTitle}
        ariaLabel="Auf Seiten"
        active={filters.scopeId !== null}
        open={popover === "scope"}
        onToggle={() => toggle("scope")}
      >
        <button
          type="button"
          role="menuitem"
          className="notes-filter-option"
          onClick={() => {
            onChange({ ...filters, scopeId: null });
            close();
          }}
        >
          <span className="notes-filter-option-icon" />
          <span className="notes-filter-option-label">Überall</span>
          {filters.scopeId === null ? <CheckIcon aria-hidden /> : null}
        </button>
        <div className="notes-filter-scroll">
          {notes
            .filter((note) => !note.archived)
            .map((note) => (
              <button
                key={note.id}
                type="button"
                role="menuitem"
                className="notes-filter-option"
                onClick={() => {
                  onChange({ ...filters, scopeId: note.id });
                  close();
                }}
              >
                <span className="notes-filter-option-icon">
                  <NotePageIcon name={note.icon} />
                </span>
                <span className="notes-filter-option-label">{note.title}</span>
                {filters.scopeId === note.id ? <CheckIcon aria-hidden /> : null}
              </button>
            ))}
        </div>
      </FilterPopover>

      <FilterPopover
        label={filters.createdWithin === "any" ? "Erstellt" : `Erstellt: ${notesRangeLabels[filters.createdWithin]}`}
        ariaLabel="Erstellt"
        active={filters.createdWithin !== "any"}
        open={popover === "created"}
        onToggle={() => toggle("created")}
      >
        {notesRangeOptions.map((range) => (
          <button
            key={range}
            type="button"
            role="menuitem"
            className="notes-filter-option"
            onClick={() => {
              onChange({ ...filters, createdWithin: range });
              close();
            }}
          >
            <span className="notes-filter-option-label">{notesRangeLabels[range]}</span>
            {filters.createdWithin === range ? <CheckIcon aria-hidden /> : null}
          </button>
        ))}
      </FilterPopover>

      <FilterPopover
        label={filters.updatedWithin === "any" ? "Geändert" : `Geändert: ${notesRangeLabels[filters.updatedWithin]}`}
        ariaLabel="Geändert"
        active={filters.updatedWithin !== "any"}
        open={popover === "updated"}
        onToggle={() => toggle("updated")}
      >
        {notesRangeOptions.map((range) => (
          <button
            key={range}
            type="button"
            role="menuitem"
            className="notes-filter-option"
            onClick={() => {
              onChange({ ...filters, updatedWithin: range });
              close();
            }}
          >
            <span className="notes-filter-option-label">{notesRangeLabels[range]}</span>
            {filters.updatedWithin === range ? <CheckIcon aria-hidden /> : null}
          </button>
        ))}
      </FilterPopover>
    </div>
  );
}

interface FilterPopoverProps {
  label: string;
  /** Stabiler Name für Hilfstechnik und Tests; die sichtbare Beschriftung kann sich ändern. */
  ariaLabel: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}

function FilterPopover({ label, ariaLabel, active, open, onToggle, children }: FilterPopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  useDismissible({ open, onClose: onToggle, rootRef });

  return (
    <div className="notes-filter" ref={rootRef}>
      <button
        type="button"
        className={`notes-filter-chip ${active ? "is-active" : ""}`}
        aria-label={ariaLabel}
        aria-expanded={open}
        data-dismiss-ignore
        onClick={onToggle}
      >
        <span className="notes-filter-label">{label}</span>
        <ChevronDownIcon aria-hidden />
      </button>
      {open ? (
        <div className="notes-filter-popover" role="menu">
          {children}
        </div>
      ) : null}
    </div>
  );
}
