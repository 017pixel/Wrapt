import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { useDismissible } from "../hooks/useDismissible.js";

interface LinkDialogProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
}

/** Kleiner Dialog zum Setzen, Ändern und Entfernen eines Links. */
export function LinkDialog({ editor, open, onClose }: LinkDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useDismissible({ open, onClose, rootRef });

  useEffect(() => {
    if (!open) return;
    setValue((editor.getAttributes("link").href as string | undefined) ?? "");
    const timer = window.setTimeout(() => inputRef.current?.select(), 30);
    return () => window.clearTimeout(timer);
  }, [editor, open]);

  if (!open) return null;

  const apply = () => {
    const href = value.trim();
    if (href === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href) ? href : `https://${href}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href: normalized }).run();
    }
    onClose();
  };

  return createPortal(
    <div className="note-link-dialog" ref={rootRef} role="dialog" aria-label="Link bearbeiten">
      <input
        ref={inputRef}
        value={value}
        placeholder="https://…"
        aria-label="Linkziel"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            apply();
          }
          if (event.key === "Escape") onClose();
        }}
      />
      <button type="button" className="quiet-button-primary" onClick={apply}>
        Übernehmen
      </button>
      {editor.isActive("link") ? (
        <button
          type="button"
          className="quiet-button"
          onClick={() => {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            onClose();
          }}
        >
          Entfernen
        </button>
      ) : null}
      <button type="button" className="quiet-button" onClick={onClose}>
        Abbrechen
      </button>
    </div>,
    document.body,
  );
}
