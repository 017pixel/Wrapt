import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrbitNode } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { notesWindowUrl, notesWorkspaceUrl } from "../../lib/notesRoutes";
import { wraptQueries } from "../../lib/queryOptions";
import { useOrbitStore } from "../../stores/orbit";
import { ExternalLinkIcon, FullscreenIcon, LoaderIcon } from "../icons";
import { NoteEditor } from "./NoteEditor.js";

interface NoteOrbitNodeProps {
  id: string;
}

function useActiveOrbitNode(id: string): OrbitNode | undefined {
  return useOrbitStore((state) => {
    const board = state.document.boards.find((candidate) => candidate.id === state.document.activeBoardId);
    return board?.nodes.find((candidate) => candidate.id === id);
  });
}

/**
 * Orbit-Knoten für eine zentrale Notiz: verbindet den Altbestand (Knoten ohne
 * Verweis) automatisch mit einer Notiz und rendert den kompakten Editor.
 */
export function NoteOrbitNode({ id }: NoteOrbitNodeProps) {
  const node = useActiveOrbitNode(id);
  const updateNode = useOrbitStore((state) => state.updateNode);
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [renameError, setRenameError] = useState(false);
  const [renameRetry, setRenameRetry] = useState(0);
  const requestedRef = useRef(false);
  const lastSyncedTitleRef = useRef<string | null>(null);
  const renamePendingRef = useRef(false);

  const noteId = node?.noteId ?? null;
  const noteQuery = useQuery({
    ...wraptQueries.note(noteId ?? ""),
    enabled: noteId !== null,
  });
  const note = noteQuery.data?.note ?? null;

  // Ohne Verweis: Notiz anlegen und vorhandenen Knotentext als Startinhalt übernehmen.
  useEffect(() => {
    if (noteId !== null || requestedRef.current || !node) return;
    requestedRef.current = true;
    setCreating(true);
    void apiClient
      .createNote({ title: node.title })
      .then(async (response) => {
        const created = response?.note;
        if (!created) return;
        if (node.content.trim() !== "") {
          await apiClient.saveNoteContent(created.id, {
            content: node.content,
            expectedRevision: created.revision,
          });
        }
        updateNode(id, { noteId: created.id });
        void queryClient.invalidateQueries({ queryKey: ["notes"] });
      })
      .catch(() => {
        requestedRef.current = false;
      })
      .finally(() => setCreating(false));
  }, [id, node, noteId, queryClient, updateNode]);

  // Titel in beide Richtungen kurz halten: Notiz gewinnt, Knoten zieht nach;
  // eine Umbenennung im Orbit wird in die Notiz übernommen.
  useEffect(() => {
    if (!note || !node) return;
    if (lastSyncedTitleRef.current === null) {
      lastSyncedTitleRef.current = note.title;
      if (node.title !== note.title) updateNode(id, { title: note.title });
      return;
    }
    if (note.title !== lastSyncedTitleRef.current) {
      lastSyncedTitleRef.current = note.title;
      if (node.title !== note.title) updateNode(id, { title: note.title });
      return;
    }
    if (node.title !== lastSyncedTitleRef.current && !renamePendingRef.current) {
      renamePendingRef.current = true;
      setRenameError(false);
      let succeeded = false;
      void apiClient.updateNote(note.id, { title: node.title }).then((updated) => {
        if (!updated?.note) throw new Error("Notiztitel konnte nicht gespeichert werden.");
        lastSyncedTitleRef.current = updated.note.title;
        succeeded = true;
        queryClient.setQueryData(wraptQueries.note(note.id).queryKey, updated);
        void queryClient.invalidateQueries({ queryKey: ["notes"] });
      }).catch(() => setRenameError(true)).finally(() => {
        renamePendingRef.current = false;
        if (succeeded) setRenameRetry((value) => value + 1);
      });
    }
  }, [id, note, node, queryClient, renameRetry, updateNode]);

  if (creating || (noteId !== null && noteQuery.isPending)) {
    return (
      <div className="orbit-note-state" role="status" aria-live="polite">
        <LoaderIcon className="h-4 w-4" />
        <span>Notiz wird geladen…</span>
      </div>
    );
  }

  if (noteQuery.isError) {
    return (
      <div className="orbit-note-state" role="alert">
        <span>Diese Notiz konnte nicht geladen werden.</span>
        <button type="button" onClick={() => void noteQuery.refetch()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="orbit-note-state" role="status">
        <span>Notiz wird vorbereitet…</span>
      </div>
    );
  }

  return (
    <div className="orbit-note-bound">
      <div className="orbit-note-actions nodrag">
        <span>Dokument</span>
        <button
          type="button"
          title="Im Notizen-Workspace öffnen"
          aria-label="Im Notizen-Workspace öffnen"
          onClick={() => window.location.assign(notesWorkspaceUrl(note.id))}
        >
          <FullscreenIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="In neuem Fenster öffnen"
          aria-label="In neuem Fenster öffnen"
          onClick={() =>
            window.open(
              notesWindowUrl(note.id),
              `wrapt-note-${note.id}`,
              "popup=yes,noopener=yes,noreferrer=yes,width=1100,height=820",
            )
          }
        >
          <ExternalLinkIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {renameError ? <div className="orbit-note-rename-error nodrag" role="alert">
        <span>Titel nicht gespeichert.</span>
        <button type="button" onClick={() => setRenameRetry((value) => value + 1)}>Erneut versuchen</button>
      </div> : null}
      <NoteEditor
        key={note.id}
        note={note}
        compact
        ariaLabel="Neue Notiz bearbeiten"
        onSaved={() => void queryClient.invalidateQueries({ queryKey: ["notes"] })}
      />
    </div>
  );
}
