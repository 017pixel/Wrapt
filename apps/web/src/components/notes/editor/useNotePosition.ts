import { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { rememberNotePosition } from "./editorBookmarks";

export function useNotePosition(noteId: string, editor: Editor | null) {
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const scroll = editor.view.dom.closest(".notes-editor-scroll");
    const remember = () => rememberNotePosition(noteId, editor);
    editor.on("selectionUpdate", remember);
    scroll?.addEventListener("scroll", remember, { passive: true });
    return () => { editor.off("selectionUpdate", remember); scroll?.removeEventListener("scroll", remember); };
  }, [editor, noteId]);
}
