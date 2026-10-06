import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { Note, NoteSummary } from "@wrapt/contracts";
import { apiClient } from "../../lib/apiClient";
import { BlockMenu } from "./editor/BlockMenu.js";
import { focusLastNoteLine } from "./editor/focusLastLine.js";
import { createNotesExtensions } from "./editor/extensions.js";
import { FormatToolbar } from "./editor/FormatToolbar.js";
import { LinkDialog } from "./editor/LinkDialog.js";
import { NoteLinkPicker } from "./editor/NoteLinkPicker.js";
import { parseNoteMarkdown } from "./editor/markdownBridge.js";
import { newNoteTitle } from "./noteTitles.js";
import { SlashMenu } from "./editor/SlashMenu.js";
import type { SlashCommandContext } from "./editor/slashCommands.js";
import { useNoteAutosave, type NoteSaveState } from "./editor/useNoteAutosave.js";

interface NoteEditorProps {
  note: Note;
  editable?: boolean;
  autoFocus?: boolean;
  onSaved?: (note: Note) => void;
  onStateChange?: (state: NoteSaveState) => void;
  /** Nach dem Anlegen einer Unterseite (Liste neu laden). */
  onSubpageCreated?: () => void;
  /** Workspace-Erstellung, damit auch die Sidebar dieselbe Verweislogik nutzt. */
  onCreateSubpage?: (parentId: string) => void;
  /** Registriert den sicheren Editor-Pfad zum Anhängen eines Seitenverweises. */
  onRegisterNoteReferenceAppender?: (parentId: string, append: NoteReferenceAppender | null) => void;
  /** Öffnet eine Notiz, etwa die frisch angelegte Unterseite. */
  onOpenNote?: (noteId: string) => void;
  /** Kompakter Zustand für den Orbit-Knoten: kleinere Abstände. */
  compact?: boolean;
  ariaLabel?: string;
}

export type NoteReferenceAppender = (parentId: string, target: Pick<Note, "id" | "title">) => Promise<boolean>;

function fileContent(file: File, url: string): JSONContent {
  if (file.type.startsWith("image/")) {
    return { type: "image", attrs: { src: url, alt: file.name } };
  }
  return {
    type: "paragraph",
    content: [
      { type: "text", text: file.name, marks: [{ type: "link", attrs: { href: url } }] },
    ],
  };
}

/**
 * Tiptap-Editor für eine Notiz. Lädt Markdown, speichert entprellt zurück und
 * zeigt Revisionskonflikte als Banner, statt still zu überschreiben.
 */
export function NoteEditor({
  note,
  editable = true,
  autoFocus = false,
  onSaved,
  onStateChange,
  onSubpageCreated,
  onCreateSubpage,
  onRegisterNoteReferenceAppender,
  onOpenNote,
  compact = false,
  ariaLabel,
}: NoteEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const noteIdRef = useRef(note.id);
  noteIdRef.current = note.id;
  const saveNowRef = useRef<() => Promise<boolean>>(async () => false);

  const [linkOpen, setLinkOpen] = useState(false);
  const [noteLinkOpen, setNoteLinkOpen] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    const asset = await apiClient.uploadOrbitAsset(file);
    return apiClient.orbitAssetUrl(asset.id);
  }, []);

  const requestLink = useCallback(() => setLinkOpen(true), []);
  const requestNoteLink = useCallback(() => setNoteLinkOpen(true), []);

  const appendNoteReference: NoteReferenceAppender = useCallback(async (parentId, target) => {
    const currentEditor = editorRef.current;
    if (!currentEditor || currentEditor.isDestroyed || parentId !== noteIdRef.current) return false;
    let exists = false;
    currentEditor.state.doc.descendants((node) => {
      if (node.type.name === "noteMention" && node.attrs.noteId === target.id) {
        exists = true;
        return false;
      }
      return !exists;
    });
    if (exists) return true;
    const inserted = currentEditor
      .chain()
      .focus()
      .insertContentAt(currentEditor.state.doc.content.size, {
        type: "paragraph",
        content: [{ type: "noteMention", attrs: { noteId: target.id, label: target.title } }],
      })
      .run();
    if (!inserted) return false;
    return saveNowRef.current();
  }, []);

  const insertNoteReference = useCallback((target: Pick<NoteSummary, "id" | "title">) => {
    editorRef.current?.chain().focus().insertContent({
      type: "noteMention",
      attrs: { noteId: target.id, label: target.title },
    }).run();
  }, []);

  const pickFile = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = () => {
      const file = input.files?.[0];
      const editor = editorRef.current;
      if (!file || !editor) return;
      void uploadFile(file)
        .then((url) => editor.chain().focus().insertContent(fileContent(file, url)).run())
        .catch(() => undefined);
    };
    input.click();
  }, [uploadFile]);

  const createSubpage = useCallback(() => {
    if (onCreateSubpage) {
      onCreateSubpage(noteIdRef.current);
      return;
    }
    void (async () => {
      const response = await apiClient.createNote({
        parentId: noteIdRef.current,
        title: newNoteTitle(),
      });
      const created = response?.note;
      if (!created) return;
      const linked = await appendNoteReference(noteIdRef.current, created);
      onSubpageCreated?.();
      if (linked) onOpenNote?.(created.id);
    })().catch(() => undefined);
  }, [appendNoteReference, onCreateSubpage, onOpenNote, onSubpageCreated]);

  const slashContextRef = useRef<SlashCommandContext>({
    pickFile: () => undefined,
    createSubpage: () => undefined,
  });
  slashContextRef.current = { pickFile, createSubpage, pickNoteLink: requestNoteLink };

  const extensions = useMemo(
    () =>
      createNotesExtensions({
        placeholder: compact ? "Notiz schreiben…" : "Schreibe etwas oder tippe / für Befehle…",
        uploadFile,
        slashContext: () => slashContextRef.current,
        onRequestLink: requestLink,
      }),
    [compact, requestLink, uploadFile],
  );

  const editor = useEditor(
    {
      extensions,
      editable,
      editorProps: {
        attributes: {
          class: compact ? "note-editor-content is-compact" : "note-editor-content",
          spellcheck: "true",
          ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        },
      },
    },
    [],
  );

  editorRef.current = editor;

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);


  useEffect(() => {
    if (!editor || compact) return;
    const scroll = editor.view.dom.closest(".notes-editor-scroll");
    if (!scroll) return;
    const focusBlank = (event: Event) => {
      const pointer = event as PointerEvent;
      const target = pointer.target as HTMLElement;
      if (pointer.button !== 0 || !target.matches(".notes-editor-scroll, .notes-editor-frame")) return;
      const last = editor.view.dom.lastElementChild?.getBoundingClientRect();
      if (last && pointer.clientY < last.bottom) return;
      pointer.preventDefault();
      focusLastNoteLine(editor);
    };
    scroll.addEventListener("pointerdown", focusBlank);
    return () => scroll.removeEventListener("pointerdown", focusBlank);
  }, [editor, compact]);

  const getMarkdown = useCallback(() => editor?.getMarkdown() ?? null, [editor]);
  const loadedNoteIdRef = useRef<string | null>(null);
  const loadedRevisionRef = useRef<number | null>(null);
  const handleSaved = useCallback((saved: Note) => {
    // Die eigene Fassung ist bereits im Editor. Eine Bestätigung darf sie
    // nicht erneut parsen oder den Cursor und die Undo-Historie zurücksetzen.
    if (loadedNoteIdRef.current === saved.id) {
      loadedRevisionRef.current = Math.max(loadedRevisionRef.current ?? 0, saved.revision);
    }
    onSaved?.(saved);
  }, [onSaved]);
  const autosave = useNoteAutosave({
    noteId: note.id,
    revision: note.revision,
    getMarkdown,
    onSaved: handleSaved,
  });
  const { schedule, flush, acceptServerNote, getDraftContent, conflictNote, state } = autosave;
  saveNowRef.current = autosave.saveNow;

  useEffect(() => {
    if (!onRegisterNoteReferenceAppender) return;
    onRegisterNoteReferenceAppender(note.id, appendNoteReference);
    return () => onRegisterNoteReferenceAppender(note.id, null);
  }, [appendNoteReference, note.id, onRegisterNoteReferenceAppender]);

  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Beim Notizwechsel zuerst die alte Notiz sichern, dann neuen Inhalt laden.
  useEffect(() => {
    if (!editor) return;
    const manager = editor.storage.markdown?.manager;
    if (!manager) return;
    if (loadedNoteIdRef.current !== note.id) {
      loadedNoteIdRef.current = note.id;
      loadedRevisionRef.current = note.revision;
      const content = getDraftContent(note.id) ?? note.content;
      editor.commands.setContent(parseNoteMarkdown(manager, content), { emitUpdate: false });
      if (autoFocus) editor.commands.focus("start");
      return;
    }
    if (note.revision <= (loadedRevisionRef.current ?? 0) || state !== "saved" || getDraftContent(note.id) !== null) return;
    loadedRevisionRef.current = note.revision;
    editor.commands.setContent(parseNoteMarkdown(manager, note.content), { emitUpdate: false });
    acceptServerNote(note);
  }, [acceptServerNote, autoFocus, editor, getDraftContent, note, state]);

  useEffect(() => {
    if (!editor) return;
    const update = () => schedule();
    editor.on("update", update);
    return () => {
      editor.off("update", update);
    };
  }, [editor, schedule]);

  // Läuft der Notizwechsel oder das Unmount an, offene Änderungen sofort
  // sichern. Der Ref hält den Flush der VORHERIGEN Notiz bereit, weil React
  // erst alle Cleanups und danach die neuen Effekte ausführt.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(
    () => () => {
      flushRef.current();
    },
    [note.id],
  );

  const resolveUseServer = useCallback(() => {
    if (!editor || !conflictNote) return;
    const manager = editor.storage.markdown?.manager;
    if (!manager) return;
    editor.commands.setContent(parseNoteMarkdown(manager, conflictNote.content), { emitUpdate: false });
    acceptServerNote(conflictNote);
    onSaved?.(conflictNote);
  }, [acceptServerNote, conflictNote, editor, onSaved]);

  return (
    <div className={compact ? "note-editor is-compact" : "note-editor"} onPointerDown={(event) => {
      if (!editor || event.button !== 0 || event.target !== event.currentTarget) return;
      event.preventDefault();
      focusLastNoteLine(editor);
    }}>
      {conflictNote ? (
        <div className="note-conflict" role="alert">
          <div>
            <strong>Diese Notiz wurde woanders geändert.</strong>
            <span>Deine Fassung bleibt im Editor, bis du eine Version auswählst.</span>
          </div>
          <div className="note-conflict-actions">
            <button type="button" className="quiet-button" onClick={resolveUseServer}>
              Serverfassung laden
            </button>
            <button type="button" className="quiet-button-primary" onClick={autosave.resolveKeepMine}>
              Meine Fassung behalten
            </button>
          </div>
        </div>
      ) : compact && state === "error" ? (
        <div className="note-conflict" role="alert">
          <div>
            <strong>Notiz konnte nicht gespeichert werden.</strong>
            <span>Deine Änderungen bleiben im Editor.</span>
          </div>
          <div className="note-conflict-actions">
            <button type="button" className="quiet-button-primary" onClick={() => void autosave.saveNow()}>
              Erneut speichern
            </button>
          </div>
        </div>
      ) : null}
      <EditorContent className="note-editor-body" editor={editor} />
      {editor ? <FormatToolbar editor={editor} onRequestLink={requestLink} /> : null}
      {editor && !compact ? <BlockMenu editor={editor} /> : null}
      <SlashMenu />
      {editor ? <LinkDialog editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} /> : null}
      <NoteLinkPicker
        open={noteLinkOpen}
        currentNoteId={note.id}
        onClose={() => setNoteLinkOpen(false)}
        onPick={insertNoteReference}
      />
    </div>
  );
}
