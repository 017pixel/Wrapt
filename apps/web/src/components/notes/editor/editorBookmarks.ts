import type { Editor } from "@tiptap/core";
interface Bookmark { version: 1; from: number; to: number; scroll: number }
const key = (id: string) => `wrapt.note-position.v1:${id}`;
export function rememberNotePosition(id: string, editor: Editor) {
  if (editor.isDestroyed) return;
  const scroll = editor.view.dom.closest(".notes-editor-scroll");
  const bookmark: Bookmark = { version: 1, from: editor.state.selection.from, to: editor.state.selection.to, scroll: scroll?.scrollTop ?? 0 };
  try { sessionStorage.setItem(key(id), JSON.stringify(bookmark)); } catch { /* Inhaltssicherung läuft unabhängig. */ }
}
export function restoreNotePosition(id: string, editor: Editor) {
  try {
    const raw = sessionStorage.getItem(key(id));
    if (!raw) return;
    const bookmark = JSON.parse(raw) as Bookmark;
    if (bookmark.version !== 1 || ![bookmark.from, bookmark.to, bookmark.scroll].every(Number.isFinite)) return;
    const max = editor.state.doc.content.size;
    editor.commands.setTextSelection({ from: Math.max(0, Math.min(bookmark.from, max)), to: Math.max(0, Math.min(bookmark.to, max)) });
    requestAnimationFrame(() => { if (!editor.isDestroyed) editor.view.dom.closest(".notes-editor-scroll")?.scrollTo({ top: bookmark.scroll }); });
  } catch { /* Veraltete Positionen verhindern das Öffnen der Notiz nicht. */ }
}
