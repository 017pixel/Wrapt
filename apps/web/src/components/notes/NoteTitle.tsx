import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Note, UpdateNoteRequest } from "@wrapt/contracts";
import { IconPicker } from "./icons/IconPicker.js";
import { NotePageIcon } from "./icons/NotePageIcon.js";

interface NoteTitleProps {
  note: Note;
  onPatch: (patch: UpdateNoteRequest) => void;
  disabled?: boolean;
}

const TITLE_SAVE_DELAY_MS = 500;

/** Titelzeile mit Material-Symbol; speichert den Titel entprellt. */
export function NoteTitle({ note, onPatch, disabled = false }: NoteTitleProps) {
  const [title, setTitle] = useState(note.title);
  const [pickerOpen, setPickerOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ value: string; originalTitle: string; onPatch: NoteTitleProps["onPatch"] } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const iconButtonRef = useRef<HTMLButtonElement>(null);
  const activeNoteRef = useRef(note.id);
  const submittedTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (activeNoteRef.current !== note.id) {
      activeNoteRef.current = note.id;
      submittedTitleRef.current = null;
    } else if (pendingRef.current || (submittedTitleRef.current !== null && submittedTitleRef.current !== note.title)) {
      return;
    }
    submittedTitleRef.current = null;
    setTitle(note.title);
  }, [note.id, note.title]);

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
      <textarea
        ref={inputRef}
        className="notes-title-input"
        value={title}
        disabled={disabled}
        placeholder="Notiz"
        aria-label="Notiztitel"
        rows={1}
        onChange={(event) => changeTitle(event.target.value.replace(/[\r\n]+/g, " "))}
        onBlur={() => {
          if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          commitTitle();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.target as HTMLTextAreaElement).blur();
          }
        }}
      />
    </div>
  );
}
