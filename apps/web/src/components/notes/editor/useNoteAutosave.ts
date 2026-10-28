import { readNoteDraft, removeNoteDraft, writeNoteDraft } from "./noteDrafts";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Note } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";
import { registerEditorReloadGuard } from "../../../lib/reloadGuard";

export type NoteSaveState = "saved" | "local" | "dirty" | "saving" | "conflict" | "error";

const AUTOSAVE_DELAY_MS = 800;

export const noteSaveStateLabels: Record<NoteSaveState, string> = {
  saved: "Gespeichert",
  local: "Lokal gesichert",
  dirty: "Ungespeichert",
  saving: "Speichert…",
  conflict: "Konflikt",
  error: "Nicht gespeichert",
};

export interface NoteAutosaveOptions {
  noteId: string;
  draftScope?: string;
  revision: number;
  /** Hält den aktuellen immutable Dokumentsnapshot ohne Serialisierung fest. */
  captureMarkdown: () => (() => string) | null;
  /** Wird nach jedem erfolgreichen Speichern gerufen (frische Revision). */
  onSaved: (note: Note) => void;
}

interface NoteDraft {
  noteId: string;
  version: number;
  serialize: () => string;
  content?: string;
}

function draftContent(draft: NoteDraft): string { return draft.content ??= draft.serialize(); }

/**
 * Autosave für Notizen: entprellt Änderungen, serialisiert Speichervorgänge und
 * macht Revisionskonflikte sichtbar, statt still zu überschreiben.
 */
export function useNoteAutosave({ noteId, draftScope = "workspace", revision, captureMarkdown, onSaved }: NoteAutosaveOptions) {
  const [restored] = useState(() => readNoteDraft(`${noteId}:${draftScope}`));
  const [localSaveFailed, setLocalSaveFailed] = useState(false);
  const [state, setState] = useState<NoteSaveState>("saved");
  const [conflictNote, setConflictNote] = useState<Note | null>(null);
  const activeNoteIdRef = useRef(noteId);
  activeNoteIdRef.current = noteId;
  const revisionsRef = useRef(new Map<string, number>([[noteId, restored?.revision ?? revision]]));
  const draftsRef = useRef(new Map<string, NoteDraft>(restored ? [[noteId, { noteId, version: 0, content: restored.content, serialize: () => restored.content }]] : []));
  const conflictsRef = useRef(new Map<string, Note>());
  const nextVersionRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const localTimerRef = useRef<number | null>(null);
  const stateRef = useRef<NoteSaveState>("saved");
  const chainRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const queuedSavesRef = useRef(new Map<string, Promise<boolean>>());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const publishState = useCallback((id: string, next: NoteSaveState) => {
    if (activeNoteIdRef.current !== id) return;
    stateRef.current = next;
    setState(next);
  }, []);

  useEffect(() => {
    const conflict = conflictsRef.current.get(noteId) ?? null;
    setConflictNote(conflict);
    stateRef.current = conflict ? "conflict" : draftsRef.current.has(noteId) ? "dirty" : "saved";
    setState(stateRef.current);
  }, [noteId]);

  useEffect(() => {
    // Eine neue Serverrevision wird nur zur Grundlage, wenn für diese Notiz
    // kein eigener Draft offen ist. Sonst muss der Versionscheck Konflikte
    // sichtbar machen.
    const current = revisionsRef.current.get(noteId);
    if (current === undefined) {
      revisionsRef.current.set(noteId, revision);
      return;
    }
    if (stateRef.current === "saved" || stateRef.current === "conflict") {
      revisionsRef.current.set(noteId, Math.max(current, revision));
    }
  }, [noteId, revision]);

  const run = useCallback((draft: NoteDraft): Promise<boolean> => {
    const key = `${draft.noteId}:${draft.version}`;
    const existing = queuedSavesRef.current.get(key);
    if (existing) return existing;

    const task = chainRef.current.then(async () => {
      if (draftsRef.current.get(draft.noteId)?.version !== draft.version) return false;
      if (conflictsRef.current.has(draft.noteId)) return false;
      setLocalSaveFailed(!writeNoteDraft(`${draft.noteId}:${draftScope}`, revisionsRef.current.get(draft.noteId) ?? revision, draftContent(draft)));
      publishState(draft.noteId, "saving");
      try {
        const result = await apiClient.saveNoteContent(draft.noteId, {
          content: draftContent(draft),
          expectedRevision: revisionsRef.current.get(draft.noteId) ?? 1,
        });
        if (!result) {
          if (draftsRef.current.get(draft.noteId)?.version === draft.version) {
            publishState(draft.noteId, "error");
          }
          return false;
        }
        revisionsRef.current.set(draft.noteId, result.note.revision);
        if (result.status === "conflict") {
          conflictsRef.current.set(draft.noteId, result.note);
          if (activeNoteIdRef.current === draft.noteId) {
            stateRef.current = "conflict";
            setConflictNote(result.note);
            setState("conflict");
          }
          return false;
        }
        if (draftsRef.current.get(draft.noteId)?.version === draft.version) {
          draftsRef.current.delete(draft.noteId);
          removeNoteDraft(`${draft.noteId}:${draftScope}`);
          publishState(draft.noteId, "saved");
        } else {
          // Ein neuerer Tastendruck kam während des Requests an. Der alte
          // Erfolg darf den Editorzustand nicht als „gespeichert“ markieren.
          publishState(draft.noteId, "dirty");
        }
        onSavedRef.current(result.note);
        return true;
      } catch {
        if (draftsRef.current.get(draft.noteId)?.version === draft.version) {
          publishState(draft.noteId, "error");
        }
        return false;
      }
    });
    const trackedTask = task.catch(() => false).finally(() => {
      if (queuedSavesRef.current.get(key) === trackedTask) queuedSavesRef.current.delete(key);
    });
    queuedSavesRef.current.set(key, trackedTask);
    chainRef.current = trackedTask;
    return trackedTask;
  }, [draftScope, publishState, revision]);

  useEffect(() => {
    const draft = draftsRef.current.get(noteId);
    if (draft && !conflictsRef.current.has(noteId)) void run(draft);
  }, [noteId, run]);

  const getDraftContent = useCallback((id: string) => {
    const draft = draftsRef.current.get(id);
    return draft ? draftContent(draft) : null;
  }, []);

  const captureDraft = useCallback((): NoteDraft | null => {
    const serialize = captureMarkdown();
    if (serialize === null) return null;
    const draft = { noteId, version: ++nextVersionRef.current, serialize };
    draftsRef.current.set(noteId, draft);

    return draft;
  }, [captureMarkdown, noteId]);

  const schedule = useCallback(() => {
    const draft = captureDraft();
    if (!draft) return;
    if (localTimerRef.current !== null) window.clearTimeout(localTimerRef.current);
    localTimerRef.current = window.setTimeout(() => {
      localTimerRef.current = null;
      if (draftsRef.current.get(noteId)?.version === draft.version) {
        const stored = writeNoteDraft(`${noteId}:${draftScope}`, revisionsRef.current.get(noteId) ?? revision, draftContent(draft));
        setLocalSaveFailed(!stored);
        if (stored && !conflictsRef.current.has(noteId) && stateRef.current === "dirty") publishState(noteId, "local");
      }
    }, 200);
    if (conflictsRef.current.has(noteId)) return;
    publishState(noteId, "dirty");
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void run(draft);
    }, AUTOSAVE_DELAY_MS);
  }, [captureDraft, draftScope, noteId, publishState, revision, run]);

  /** Speichert sofort und wartet, bis der Serverstand bestätigt ist. */
  const saveNow = useCallback((): Promise<boolean> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const draft = draftsRef.current.get(noteId) ?? captureDraft();
    return draft ? run(draft) : Promise.resolve(false);
  }, [captureDraft, noteId, run]);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const draft = draftsRef.current.get(noteId);
    if (draft) writeNoteDraft(`${noteId}:${draftScope}`, revisionsRef.current.get(noteId) ?? revision, draftContent(draft));
    if (draft && (stateRef.current === "dirty" || stateRef.current === "local" || stateRef.current === "error" || stateRef.current === "saving")) {
      void run(draft);
    }
  }, [draftScope, noteId, revision, run]);

  /** Serverfassung übernehmen: Revision nachziehen, Konflikt auflösen. */
  const acceptServerNote = useCallback((note: Note) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    revisionsRef.current.set(note.id, note.revision);
    draftsRef.current.delete(note.id);
    removeNoteDraft(`${note.id}:${draftScope}`);
    conflictsRef.current.delete(note.id);
    if (activeNoteIdRef.current === note.id) {
      stateRef.current = "saved";
      setConflictNote(null);
      setState("saved");
    }
  }, [draftScope]);

  /** Eigene Fassung durchsetzen: mit der Serverrevision erneut speichern. */
  const resolveKeepMine = useCallback(() => {
    conflictsRef.current.delete(noteId);
    setConflictNote(null);
    publishState(noteId, "dirty");
    const draft = draftsRef.current.get(noteId) ?? captureDraft();
    if (draft) void run(draft);
  }, [captureDraft, noteId, publishState, run]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [flush]);

  useEffect(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (localTimerRef.current !== null) window.clearTimeout(localTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const unregister = registerEditorReloadGuard(() => state !== "saved");
    const guard = (event: BeforeUnloadEvent) => {
      if (state === "dirty" || state === "saving" || state === "error" || state === "conflict") event.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => { unregister(); window.removeEventListener("beforeunload", guard); };
  }, [state]);

  return {
    localSaveFailed,
    state,
    conflictNote,
    schedule,
    flush,
    saveNow,
    acceptServerNote,
    resolveKeepMine,
    getDraftContent,
    /** Solange ein Konflikt offen ist, wird nicht automatisch gespeichert. */
    isBlocked: state === "conflict",
  };
}
