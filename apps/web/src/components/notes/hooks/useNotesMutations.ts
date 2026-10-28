import type { NoteUndoAction } from "../NotesUndo";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Note, NotesListResponse, UpdateNoteRequest } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";
import { newNoteTitle } from "../noteTitles.js";
import type { NotesDropResult } from "../sidebar/treeDrop.js";
import { cacheSavedNote, publishMovedNote, publishSavedNote } from "../noteQueryUpdates.js";

interface Options {
  appendParentReference: (parentId: string, note: Note, inline?: boolean) => Promise<boolean>;
  invalidateNotes: () => Promise<unknown>;
  showActionError: (message: string) => void;
  onSelectNote: (id: string | null) => void;
  closeMobileSidebar: () => void;
  onUndoAction?: (action: NoteUndoAction) => void;
}

export function useNotesMutations(options: Options) {
  const queryClient = useQueryClient();
  const createMutation = useMutation({
    mutationFn: async (input: { title?: string; parentId: string | null; folderId?: string | null; favorite?: boolean; inlineReference?: boolean }) => {
      const { inlineReference = false, title = newNoteTitle(), ...request } = input;
      const created = await apiClient.createNote({ title, ...request });
      if (!created?.note) throw new Error("Die Seite konnte nicht erstellt werden.");
      return { note: created.note, inlineReference };
    },
    onSuccess: async ({ note, inlineReference }, variables) => {
      cacheSavedNote(queryClient, note);
      if (variables.parentId !== null && !await options.appendParentReference(variables.parentId, note, inlineReference)) {
        options.showActionError("Unterseite erstellt; der Verweis konnte nicht gespeichert werden.");
      }
      // Der Verweis kann durch einen fremden Editor geschrieben worden sein.
      if (variables.parentId !== null) void queryClient.invalidateQueries({ queryKey: ["notes", "detail", variables.parentId], exact: true });
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
    onSuccess: (note, variables) => {
      void publishSavedNote(queryClient, note);
      if (variables.patch.archived === true) options.onUndoAction?.({ label: "Seite in den Papierkorb gelegt", run: async () => {
        const result = await apiClient.updateNote(note.id, { archived: false });
        if (!result) throw new Error("Wiederherstellen fehlgeschlagen");
        await publishSavedNote(queryClient, result.note);
        options.onSelectNote(note.id);
      } });
    },
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
    onMutate: async ({ noteId, drop }) => {
      const previous = queryClient.getQueryData<NotesListResponse>(["notes", "list"])?.notes.find((entry) => entry.id === noteId);
      const parentBefore = drop.parentId ? (await apiClient.note(drop.parentId))?.note : null;
      return { previous, parentBefore };
    },
    onSuccess: async (note, _variables, context) => {
      const previous = context?.previous;
      let parentAfter: Note | undefined;
      const undo = previous ? { label: "Seite verschoben", run: async () => {
        const before = context?.parentBefore;
        const marker = new RegExp('\\[noteMention\\s+[^\\]]*noteId="' + note.id + '"[^\\]]*\\]');
        if (before && parentAfter && !marker.test(before.content) && marker.test(parentAfter.content)) {
          const current = (await apiClient.note(parentAfter.id))?.note;
          if (!current || current.content !== parentAfter.content) throw new Error("Die Zielseite wurde inzwischen bearbeitet.");
          const restored = await apiClient.saveNoteContent(current.id, { content: current.content.replace(marker, ""), expectedRevision: current.revision });
          if (!restored || restored.status !== "saved") throw new Error("Verweis konnte nicht zurückgenommen werden.");
          await publishSavedNote(queryClient, restored.note);
        }
        const result = await apiClient.updateNote(note.id, { parentId: previous!.parentId, folderId: previous!.folderId ?? null, sortOrder: previous!.sortOrder });
        if (!result) throw new Error("Verschieben fehlgeschlagen");
        await publishMovedNote(queryClient, result.note);
      } } : null;
      await publishMovedNote(queryClient, note);
      if (note.parentId !== null) {
        if (!await options.appendParentReference(note.parentId, note)) {
          options.showActionError("Seite verschoben; der Verweis konnte nicht gespeichert werden.");
        }
        parentAfter = (await apiClient.note(note.parentId))?.note;
        void queryClient.invalidateQueries({ queryKey: ["notes", "detail", note.parentId], exact: true });
      }
      if (undo) options.onUndoAction?.(undo);
    },
    onError: () => options.showActionError("Die Seite konnte nicht verschoben werden."),
  });
  return { createMutation, patchMutation, moveMutation };
}
