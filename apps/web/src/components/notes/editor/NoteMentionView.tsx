import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { wraptQueries } from "../../../lib/queryOptions";
import { NotePageIcon } from "../icons/NotePageIcon.js";

/** Chip für einen Seiten-Verweis; öffnet die Zielseite im Notizen-Workspace. */
export function NoteMentionView({ node }: NodeViewProps) {
  const navigate = useNavigate();
  const list = useQuery(wraptQueries.notesList());
  const noteId = node.attrs.noteId as string | null;
  const label = (node.attrs.label ?? "Notiz") as string;
  const linked = noteId === null ? undefined : list.data?.notes.find((note) => note.id === noteId);
  const displayTitle = linked?.title ?? label;

  return (
    <NodeViewWrapper as="span" className="note-mention" contentEditable={false}>
      <button
        type="button"
        disabled={noteId === null}
        title={`Seite öffnen: ${displayTitle}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (noteId !== null) navigate(`/notizen?note=${encodeURIComponent(noteId)}`);
        }}
      >
        <NotePageIcon name={linked?.icon ?? null} />
          {displayTitle}
      </button>
    </NodeViewWrapper>
  );
}
