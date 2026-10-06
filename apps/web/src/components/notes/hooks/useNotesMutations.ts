import { useMutation } from "@tanstack/react-query";
import type { Note, UpdateNoteRequest } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";
import { newNoteTitle } from "../noteTitles.js";
import type { NotesDropResult } from "../sidebar/treeDrop.js";

interface Options {
  appendParentReference: (parentId: string, note: Note) => Promise<boolean>;
  invalidateNotes: () => Promise<unknown>;
  showActionError: (message: string) => void;
  onSelectNote: (id: string | null) => void;
  closeMobileSidebar: () => void;
}

export function useNotesMutations(options: Options) {
  const createMutation = useMutation({
    mutationFn: async (input: { parentId: string | null; folderId?: string | null; favorite?: boolean }) => {
      const created = await apiClient.createNote({ title: newNoteTitle(), ...input });
      if (!created?.note) throw new Error("Die Seite konnte nicht erstellt werden.");
      return created.note;
    },
    onSuccess: async (note, variables) => {
      if (variables.parentId !== null && !await options.appendParentReference(variables.parentId, note)) {
        options.showActionError("Unterseite erstellt; der Verweis konnte nicht gespeichert werden.");
      }
      void options.invalidateNotes();
      options.onSelectNote(note.id);
      options.closeMobileSidebar();
    },
    onError: () => options.showActionError("Die Seite konnte nicht erstellt werden."),
  });
  const patchMutation = useMutation({
    scope: { id: "notes-metadata" },
    mutationFn: async ({ noteId, patch }: { noteId: string; patch: UpdateNoteRequest }) => {
      const response = await apiClient.updateNote(noteId, patch);
      if (!response) throw new Error("Die Änderung konnte nicht gespeichert werden.");
      return response.note;
    },
    onSuccess: () => void options.invalidateNotes(),
    onError: () => options.showActionError("Die Änderung konnte nicht gespeichert werden."),
  });
  const moveMutation = useMutation({
    scope: { id: "notes-metadata" },
    mutationFn: async ({ noteId, drop }: { noteId: string; drop: NotesDropResult }) => {
      const response = await apiClient.moveNote(noteId, {
        parentId: drop.parentId, beforeId: drop.beforeId ?? null,
        ...(drop.folderId === undefined ? {} : { folderId: drop.folderId }),
      });
      if (!response) throw new Error("Die Seite konnte nicht verschoben werden.");
      return response.note;
    },
    onSuccess: () => void options.invalidateNotes(),
    onError: () => options.showActionError("Die Seite konnte nicht verschoben werden."),
  });
  return { createMutation, patchMutation, moveMutation };
}
