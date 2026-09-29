import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";

export type NoteSaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

const AUTOSAVE_DELAY_MS = 800;

export const noteSaveStateLabels: Record<NoteSaveState, string> = {
  saved: "Gespeichert",
  dirty: "Ungespeichert",
  saving: "Speichert…",
  conflict: "Konflikt",
  error: "Nicht gespeichert",
};

export interface NoteAutosaveOptions {
  noteId: string;
  revision: number;
  getMarkdown: () => string | null;
  /** Wird nach jedem erfolgreichen Speichern gerufen (frische Revision). */
  onSaved: (note: Note) => void;
}

/**
 * Autosave für Notizen: entprellt Änderungen, serialisiert Speichervorgänge und
 * macht Revisionskonflikte sichtbar, statt still zu überschreiben.
 */
export function useNoteAutosave({ noteId, revision, getMarkdown, onSaved }: NoteAutosaveOptions) {
  const [state, setState] = useState<NoteSaveState>("saved");
  const [conflictNote, setConflictNote] = useState<Note | null>(null);
  const revisionRef = useRef(revision);
  const timerRef = useRef<number | null>(null);
  const stateRef = useRef<NoteSaveState>("saved");
  /** Serialisiert Speichervorgänge; jeder Aufruf hängt sich an das Ende der Kette. */
  const chainRef = useRef<Promise<boolean>>(Promise.resolve(true));

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    // Revision nur übernehmen, wenn lokal nichts aussteht. Sonst könnte eine
    // Änderung von einem anderen Gerät beim nächsten Autosave still
    // überschrieben werden, statt als Konflikt sichtbar zu werden.
    if (stateRef.current === "saved" || stateRef.current === "conflict") {
      revisionRef.current = revision;
    }
  }, [revision]);

  useEffect(() => {
    setState("saved");
    setConflictNote(null);
  }, [noteId]);

  const run = useCallback((): Promise<boolean> => {
    const task = chainRef.current.then(async () => {
      if (stateRef.current === "conflict") return false;
      const markdown = getMarkdown();
      if (markdown === null) return false;
      setState("saving");
      try {
        const result = await apiClient.saveNoteContent(noteId, {
          content: markdown,
          expectedRevision: revisionRef.current,
        });
        if (!result) return false;
        revisionRef.current = result.note.revision;
        if (result.status === "saved") {
          onSaved(result.note);
          setState("saved");
          return true;
        } else {
          stateRef.current = "conflict";
          setConflictNote(result.note);
          setState("conflict");
          return false;
        }
      } catch {
        setState("error");
        return false;
      }
    });
    chainRef.current = task.catch(() => false);
    return task;
  }, [getMarkdown, noteId, onSaved]);

  const schedule = useCallback(() => {
    if (stateRef.current === "conflict") return;
    setState((previous) => (previous === "conflict" ? previous : "dirty"));
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void run();
    }, AUTOSAVE_DELAY_MS);
  }, [run]);

  /** Speichert sofort und wartet, bis der Serverstand bestätigt ist. */
  const saveNow = useCallback((): Promise<boolean> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return run();
  }, [run]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (stateRef.current === "dirty" || stateRef.current === "error") {
      void run();
    }
  }, [run]);

  /** Serverfassung übernehmen: Revision nachziehen, Konflikt auflösen. */
  const acceptServerNote = useCallback((note: Note) => {
    revisionRef.current = note.revision;
    stateRef.current = "saved";
    setConflictNote(null);
    setState("saved");
  }, []);

  /** Eigene Fassung durchsetzen: mit der Serverrevision erneut speichern. */
  const resolveKeepMine = useCallback(() => {
    stateRef.current = "dirty";
    setConflictNote(null);
    setState("dirty");
    void run();
  }, [run]);

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "error" || state === "conflict") event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [state]);

  return {
    state,
    conflictNote,
    schedule,
    flush,
    saveNow,
    acceptServerNote,
    resolveKeepMine,
    /** Solange ein Konflikt offen ist, wird nicht automatisch gespeichert. */
    isBlocked: state === "conflict",
  };
}
