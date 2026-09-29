import { useMemo, useState } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import { ChevronDownIcon, ChevronRightIcon } from "../../icons";
import { useNotesPreferences } from "../../../stores/notesPreferences.js";
import { NotesSidebarRow } from "./NotesSidebarRow.js";

interface NotesRecentSectionProps {
  notes: readonly NoteSummary[];
  activeId: string | null;
  onSelect: (noteId: string) => void;
  onOpenMenu: (note: NoteSummary, anchor: DOMRect) => void;
}

const COLLAPSED_COUNT = 5;
const EXPANDED_COUNT = 12;

/** „Zuletzt verwendet“: die zuletzt geänderten Seiten, mit Mehr/Weniger. */
export function NotesRecentSection({ notes, activeId, onSelect, onOpenMenu }: NotesRecentSectionProps) {
  const [showMore, setShowMore] = useState(false);
  const collapsed = useNotesPreferences((state) => state.collapsedSections.recent === true);
  const toggleSection = useNotesPreferences((state) => state.toggleSection);
  const recent = useMemo(
    () =>
      notes
        .filter((note) => !note.archived)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [notes],
  );
  const visible = recent.slice(0, showMore ? EXPANDED_COUNT : COLLAPSED_COUNT);
  if (recent.length === 0) return null;

  return (
    <section className="notes-group">
      <div className="notes-group-head">
        <button
          type="button"
          id="notes-recent-heading"
          className="notes-group-toggle"
          aria-expanded={!collapsed}
          aria-controls="notes-recent-list"
          onClick={() => toggleSection("recent")}
        >
          <span>Zuletzt verwendet</span>
          {collapsed ? <ChevronRightIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
        </button>
      </div>
      <div id="notes-recent-list" aria-labelledby="notes-recent-heading" hidden={collapsed}>
        {visible.map((note) => (
          <NotesSidebarRow
            key={note.id}
            note={note}
            active={note.id === activeId}
            onSelect={() => onSelect(note.id)}
            onOpenMenu={onOpenMenu}
          />
        ))}
        {recent.length > COLLAPSED_COUNT ? (
          <button
            type="button"
            className="notes-group-more"
            onClick={() => setShowMore((value) => !value)}
          >
            {showMore ? "Weniger" : "Mehr"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
