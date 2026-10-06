import type { Editor } from "@tiptap/core";

/** Ein Klick auf freien Platz beginnt am Ende, auch nach Bildern oder Tabellen. */
export function focusLastNoteLine(editor: Editor): void {
  if (!editor.isEditable || editor.isDestroyed) return;
  const { doc } = editor.state;
  if (doc.lastChild?.type.name !== "paragraph") {
    editor.commands.insertContentAt(doc.content.size, { type: "paragraph" });
  }
  editor.commands.focus("end");
  editor.view.focus();
}
