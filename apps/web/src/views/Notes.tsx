import { useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { NotesWorkspace } from "../components/notes/NotesWorkspace";
import { notesWindowPath, notesWorkspacePath } from "../lib/notesRoutes";

/** Notizen-Übersicht; die geöffnete Notiz steht als `?note=` in der URL. */
export function Notes() {
  const [params, setParams] = useSearchParams();
  const noteId = params.get("note");

  const select = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params);
      if (id === null) next.delete("note");
      else next.set("note", id);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  return <NotesWorkspace noteId={noteId} onSelectNote={select} />;
}

/** Eigenständiges Fenster für genau eine Notiz. */
export function NotesWindowRoute() {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const select = useCallback(
    (id: string | null) => {
      navigate(id === null ? notesWorkspacePath() : notesWindowPath(id), { replace: true });
    },
    [navigate],
  );
  return (
    <NotesWorkspace
      noteId={noteId ?? null}
      onSelectNote={select}
      windowMode
    />
  );
}
