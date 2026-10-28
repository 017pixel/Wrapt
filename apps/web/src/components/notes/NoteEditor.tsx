import { useNotePosition } from "./editor/useNotePosition";
import { MobileNoteToolbar } from "./editor/MobileNoteToolbar";
import { rememberNotePosition, restoreNotePosition } from "./editor/editorBookmarks";
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
import { insertNoteReferenceInEditor } from "./editor/noteReferences.js";

interface NoteEditorProps {
  note: Note;
  draftScope?: string;
  onRegisterSave?: (save: (() => Promise<boolean>) | null) => void;
  editable?: boolean;
  autoFocus?: boolean;
  showMobileToolbar?: boolean;
  onSaved?: (note: Note) => void;
  onStateChange?: (state: NoteSaveState) => void;
  /** Nach dem Anlegen einer Unterseite (Liste neu laden). */
  onSubpageCreated?: () => void;
  /** Workspace-Erstellung, damit auch die Sidebar dieselbe Verweislogik nutzt. */
  onCreateSubpage?: (parentId: string, inlineReference?: boolean) => void;
  /** Registriert den sicheren Editor-Pfad zum Anhängen eines Seitenverweises. */
  onRegisterNoteReferenceAppender?: (parentId: string, append: NoteReferenceAppender | null) => void;
  /** Öffnet eine Notiz, etwa die frisch angelegte Unterseite. */
  onOpenNote?: (noteId: string) => void;
  ariaLabel?: string;
  onRegisterBodyFocus?: (focus: (() => void) | null) => void;
}

export type NoteReferenceAppender = (parentId: string, target: Pick<Note, "id" | "title">, inline?: boolean) => Promise<boolean>;

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
  draftScope = "workspace",
  onRegisterSave,
  editable = true,
  autoFocus = false,
  showMobileToolbar = true,
  onSaved,
  onStateChange,
  onSubpageCreated,
  onCreateSubpage,
  onRegisterNoteReferenceAppender,
  onOpenNote,
  ariaLabel,
  onRegisterBodyFocus,
}: NoteEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const noteIdRef = useRef(note.id);
  noteIdRef.current = note.id;
  const saveNowRef = useRef<() => Promise<boolean>>(async () => false);

  const [failedUpload, setFailedUpload] = useState<{ file: File; position: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [noteLinkOpen, setNoteLinkOpen] = useState(false);

  const uploadFile = useCallback(async (file: File) => {
    const position = editorRef.current?.state.selection.from ?? 0;
    try {
      const asset = await apiClient.uploadMedia(file);
      setFailedUpload(null);
      return apiClient.mediaUrl(asset.id);
    } catch (error) { setFailedUpload({ file, position }); throw error; }
  }, []);

  const requestLink = useCallback(() => setLinkOpen(true), []);
  const requestNoteLink = useCallback(() => setNoteLinkOpen(true), []);

  const appendNoteReference: NoteReferenceAppender = useCallback(async (parentId, target, inline = false) => {
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
    const inserted = insertNoteReferenceInEditor(currentEditor, target, inline);
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

  const createSubpage = useCallback((inlineReference = false) => {
    if (onCreateSubpage) {
      onCreateSubpage(noteIdRef.current, inlineReference);
      return;
    }
    void (async () => {
      const response = await apiClient.createNote({
        parentId: noteIdRef.current,
        title: newNoteTitle(),
      });
      const created = response?.note;
      if (!created) return;
      const linked = await appendNoteReference(noteIdRef.current, created, inlineReference);
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
        placeholder: "Schreibe etwas oder tippe / für Befehle…",
        uploadFile,
        slashContext: () => slashContextRef.current,
        onRequestLink: requestLink,
      }),
    [requestLink, uploadFile],
  );

  const editor = useEditor(
    {
      extensions,
      editable,
      editorProps: {
        attributes: {
          class: "note-editor-content",
          spellcheck: "true",
          "data-testid": "note-editor",
          ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        },
      },
    },
    [],
  );

  editorRef.current = editor;
  useNotePosition(note.id, editor);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    onRegisterBodyFocus?.(() => { if (!editor.isDestroyed) editor.commands.focus(); });
    return () => onRegisterBodyFocus?.(null);
  }, [editor, onRegisterBodyFocus]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);


  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
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
  }, [editor]);

  const captureMarkdown = useCallback(() => {
    if (!editor || editor.isDestroyed || !editor.storage.markdown?.manager) return null;
    const document = editor.state.doc;
    const manager = editor.storage.markdown.manager;
    return () => manager.serialize(document.toJSON());
  }, [editor]);
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
    draftScope,
    revision: note.revision,
    captureMarkdown,
    onSaved: handleSaved,
  });
  useEffect(() => {
    onRegisterSave?.(autosave.saveNow);
    return () => onRegisterSave?.(null);
  }, [autosave.saveNow, onRegisterSave]);
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
    if (!editor || editor.isDestroyed) return;
    const manager = editor.storage.markdown?.manager;
    if (!manager) return;
    if (loadedNoteIdRef.current !== note.id) {
      loadedNoteIdRef.current = note.id;
      loadedRevisionRef.current = note.revision;
      const content = getDraftContent(note.id) ?? note.content;
      editor.commands.setContent(parseNoteMarkdown(manager, content), { emitUpdate: false });
      restoreNotePosition(note.id, editor);
      if (autoFocus) editor.commands.focus();
      return;
    }
    if (note.revision <= (loadedRevisionRef.current ?? 0) || state !== "saved" || getDraftContent(note.id) !== null) return;
    loadedRevisionRef.current = note.revision;
    editor.commands.setContent(parseNoteMarkdown(manager, note.content), { emitUpdate: false });
    acceptServerNote(note);
  }, [acceptServerNote, autoFocus, editor, getDraftContent, note, state]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
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
      if (editorRef.current) rememberNotePosition(note.id, editorRef.current);
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
    <div className="note-editor" onPointerDown={(event) => {
      if (!editor || event.button !== 0 || event.target !== event.currentTarget) return;
      event.preventDefault();
      focusLastNoteLine(editor);
    }}>
      {autosave.localSaveFailed && state !== "saved" ? <p className="note-action-error" role="alert">Lokale Sicherung nicht möglich. Lass diese Seite bis zur Serverbestätigung geöffnet.</p> : null}
      {state === "error" ? <p className="note-action-error" role="alert">Nicht auf dem Server gespeichert. <button type="button" onClick={() => void autosave.saveNow()}>Erneut versuchen</button></p> : null}
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
      ) : null}
      {failedUpload ? <p className="note-action-error" role="alert">„{failedUpload.file.name}“ konnte nicht hochgeladen werden. <button type="button" onClick={() => {
        const pending = failedUpload;
        void uploadFile(pending.file).then((url) => {
          if (editor && !editor.isDestroyed) editor.chain().focus().insertContentAt(Math.min(pending.position, editor.state.doc.content.size), fileContent(pending.file, url)).run();
        }).catch(() => undefined);
      }}>Upload wiederholen</button></p> : null}
      <EditorContent className="note-editor-body" editor={editor} />
      {editor && showMobileToolbar ? <MobileNoteToolbar editor={editor} onLink={requestLink} /> : null}
      {editor ? <FormatToolbar editor={editor} onRequestLink={requestLink} /> : null}
      {editor ? <BlockMenu editor={editor} /> : null}
      <SlashMenu editor={editor} />
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
