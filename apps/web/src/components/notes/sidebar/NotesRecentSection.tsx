import { useMemo, useState } from "react";
import type { NoteSummary } from "@wrapt/contracts";
import { NotesSection } from "./NotesSection.js";
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
    <NotesSection id="recent" title="Zuletzt verwendet">
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
    </NotesSection>
  );
}
