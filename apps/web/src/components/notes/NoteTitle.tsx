import { readNoteTitleDraft, removeNoteTitleDraft, writeNoteTitleDraft } from "./editor/noteDrafts";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Note, UpdateNoteRequest } from "@wrapt/contracts";
import { NOTE_TITLE_MAX_LENGTH } from "@wrapt/contracts";
import { IconPicker } from "./icons/IconPicker.js";
import { NotePageIcon } from "./icons/NotePageIcon.js";
import { registerEditorReloadGuard } from "../../lib/reloadGuard";

interface NoteTitleProps {
  note: Note;
  draftScope?: string;
  onPatch: (patch: UpdateNoteRequest) => void;
  disabled?: boolean;
  onEnterBody?: () => void;
}

const TITLE_SAVE_DELAY_MS = 500;

/** Titelzeile mit Material-Symbol; speichert den Titel entprellt. */
export function NoteTitle({ note, draftScope = "workspace", onPatch, disabled = false, onEnterBody }: NoteTitleProps) {
  const [title, setTitle] = useState(note.title);
  const [recoveryTitle, setRecoveryTitle] = useState<string | null>(null);
  const [localTitleError, setLocalTitleError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ value: string; originalTitle: string; onPatch: NoteTitleProps["onPatch"] } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const activeNoteRef = useRef(note.id);
  const recoveryCheckedRef = useRef<string | null>(null);
  const submittedTitleRef = useRef<string | null>(null);
  useEffect(() => registerEditorReloadGuard(() => title.trim() !== note.title.trim()), [note.title, title]);

  useEffect(() => {
    const recovered = readNoteTitleDraft(`${note.id}:${draftScope}`);
    if (recovered && recovered.value.trim() === note.title) { removeNoteTitleDraft(`${note.id}:${draftScope}`); setRecoveryTitle(null); }
    else if (recovered && recoveryCheckedRef.current !== note.id) {
      recoveryCheckedRef.current = note.id;
      if (!recovered.value.trim()) {
        removeNoteTitleDraft(`${note.id}:${draftScope}`);
        setTitle(note.title);
      } else if (recovered.originalTitle === note.title) {
        setTitle(recovered.value);
        submittedTitleRef.current = recovered.value.trim();
        onPatch({ title: recovered.value.trim() });
      } else setRecoveryTitle(recovered.value);
      return;
    }
    recoveryCheckedRef.current = note.id;
    if (activeNoteRef.current !== note.id) {
      activeNoteRef.current = note.id;
      submittedTitleRef.current = null;
    } else {
      // Eine Serverbestätigung enthält den getrimmten Titel. Solange das Feld
      // aktiv ist, bleibt der unveränderte Entwurf mit seinem Leerzeichen
      // erhalten, damit die nächste Eingabe direkt weitergehen kann.
      if (document.activeElement === inputRef.current) {
        if (submittedTitleRef.current === note.title) submittedTitleRef.current = null;
        return;
      }
      if (pendingRef.current || (submittedTitleRef.current !== null && submittedTitleRef.current !== note.title)) return;
    }
    submittedTitleRef.current = null;
    setTitle(note.title);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftScope, note.id, note.title]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight}px`;
    };
    resize();
    let width = input.getBoundingClientRect().width;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const nextWidth = input.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      resize();
    });
    observer?.observe(input);
    window.addEventListener("resize", resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [title]);

  const commitTitle = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    const trimmed = pending.value.trim();
    if (trimmed && trimmed !== (submittedTitleRef.current ?? pending.originalTitle)) {
      submittedTitleRef.current = trimmed;
      pending.onPatch({ title: trimmed });
    }
  }, []);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    commitTitle();
  }, [commitTitle, note.id]);

  const changeTitle = (value: string) => {
    setTitle(value);
    if (value.trim()) setLocalTitleError(!writeNoteTitleDraft(`${note.id}:${draftScope}`, note.title, value));
    else { removeNoteTitleDraft(`${note.id}:${draftScope}`); setLocalTitleError(false); }
    pendingRef.current = { value, originalTitle: note.title, onPatch };
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      commitTitle();
    }, TITLE_SAVE_DELAY_MS);
  };

  return (
    <div className="notes-title-row">
      <div className="notes-title-icon-wrap">
        <button
          ref={iconButtonRef}
          type="button"
          className={`notes-title-icon ${note.icon === null ? "is-empty" : ""}`}
          aria-label={note.icon === null ? "Symbol wählen" : "Symbol ändern"}
          title={note.icon === null ? "Symbol hinzufügen" : "Symbol ändern"}
          disabled={disabled}
          data-dismiss-ignore
          onClick={() => setPickerOpen((open) => !open)}
        >
          <NotePageIcon name={note.icon} />
        </button>
        {pickerOpen ? (
          <IconPicker
            onPick={(name) => onPatch({ icon: name })}
            {...(note.icon === null ? {} : { onRemove: () => onPatch({ icon: null }) })}
            onClose={() => setPickerOpen(false)}
            anchor={iconButtonRef.current}
          />
        ) : null}
      </div>
      {recoveryTitle !== null ? <div className="note-action-error" role="alert">Ein lokaler Titelentwurf ist erhalten: „{recoveryTitle}“. <button type="button" onClick={() => { setTitle(recoveryTitle); onPatch({ title: recoveryTitle.trim() || note.title }); setRecoveryTitle(null); }}>Titel wiederherstellen</button></div> : null}
      {localTitleError ? <span role="alert">Titel konnte nicht lokal gesichert werden.</span> : null}
      <textarea
        ref={inputRef}
        className="notes-title-input"
        value={title}
        disabled={disabled}
        placeholder="Notiz"
        aria-label="Notiztitel"
        rows={1}
        maxLength={NOTE_TITLE_MAX_LENGTH}
        onChange={(event) => changeTitle(event.target.value.replace(/[\r\n]+/g, " "))}
        onBlur={() => {
          const pendingTitle = pendingRef.current?.value.trim();
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          commitTitle();
          setTitle(pendingTitle ?? submittedTitleRef.current ?? note.title);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            (event.target as HTMLTextAreaElement).blur();
            onEnterBody?.();
          }
        }}
      />
    </div>
  );
}
