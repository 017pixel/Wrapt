import { useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { ChevronRightIcon, PlusIcon } from "../../icons";
import { useNotesPreferences } from "../../../stores/notesPreferences.js";
import { NOTE_DRAG_TYPE, NOTE_SECTION_DRAG_TYPE, useNotesDrag } from "./NotesDragContext.js";

interface Props {
  id: string;
  title: string;
  children: ReactNode;
  onCreate?: () => void;
  onDropNote?: (noteId: string) => void;
  actions?: ReactNode;
}

/** Gemeinsame, sortierbare Gruppe mit Tastaturalternative und animiertem Inhalt. */
export function NotesSection({ id, title, children, onCreate, onDropNote, actions }: Props) {
  const collapsed = useNotesPreferences((state) => state.collapsedSections[id] === true);
  const toggle = useNotesPreferences((state) => state.toggleSection);
  const moveSection = useNotesPreferences((state) => state.moveSection);
  const [over, setOver] = useState(false);
  const drag = useNotesDrag();
  const acceptDrag = (event: DragEvent) => {
    const types = event.dataTransfer.types;
    // WebKit meldet eigene Typen beim Darüberziehen nicht immer — der
    // React-Zustand aus `onDragStart` springt dann als Rückfall ein.
    const hasSection = types.includes(NOTE_SECTION_DRAG_TYPE) || drag.sectionId !== null;
    const hasNote = onDropNote !== undefined && (types.includes(NOTE_DRAG_TYPE) || drag.noteId !== null);
    if (hasSection || hasNote) {
      event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(true);
    }
  };
  return <section className={`notes-group ${over ? "is-drop-section" : ""}`} data-section={id}
    onDragOver={acceptDrag} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(false); }}
    onDrop={(event) => {
      const sectionId = event.dataTransfer.getData(NOTE_SECTION_DRAG_TYPE) || drag.sectionId;
      const noteId = event.dataTransfer.getData(NOTE_DRAG_TYPE) || drag.noteId;
      setOver(false);
      if (sectionId && sectionId !== id) { event.preventDefault(); moveSection(sectionId, id, [...event.currentTarget.closest(".notes-sidebar-scroll")!.querySelectorAll<HTMLElement>("[data-section]")].map((group) => group.dataset.section!)); }
      else if (noteId && onDropNote) { event.preventDefault(); onDropNote(noteId); }
    }}>
    <div className="notes-group-head">
      <button type="button" id={`notes-${id}-heading`} className="notes-group-toggle"
        draggable aria-expanded={!collapsed} aria-controls={`notes-${id}-list`}
        onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData(NOTE_SECTION_DRAG_TYPE, id); event.dataTransfer.effectAllowed = "move"; drag.setSectionId(id); }}
        onDragEnd={() => drag.setSectionId(null)}
        onKeyDown={(event) => {
          if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
          const groups = [...event.currentTarget.closest(".notes-sidebar-scroll")!.querySelectorAll<HTMLElement>("[data-section]")].map((group) => group.dataset.section!);
          const index = groups.indexOf(id);
          const neighbor = groups[index + (event.key === "ArrowUp" ? -1 : 1)];
          if (neighbor) { event.preventDefault(); moveSection(event.key === "ArrowUp" ? id : neighbor, event.key === "ArrowUp" ? neighbor : id, groups); }
        }}
        title="Ziehen zum Sortieren. Alt + Pfeiltasten verschiebt den Abschnitt."
        onClick={() => toggle(id)}>
        <span>{title}</span><ChevronRightIcon className={!collapsed ? "is-expanded" : ""} aria-hidden />
      </button>
      {actions}
      {onCreate ? <button type="button" className="notes-group-action is-create" aria-label={`Neue Seite in ${title}`} onClick={onCreate}><PlusIcon aria-hidden /></button> : null}
    </div>
    <div className="notes-group-content" data-collapsed={collapsed} inert={collapsed ? true : undefined} aria-hidden={collapsed || undefined}>
      <div id={`notes-${id}-list`} aria-labelledby={`notes-${id}-heading`}>{children}</div>
    </div>
  </section>;
}
