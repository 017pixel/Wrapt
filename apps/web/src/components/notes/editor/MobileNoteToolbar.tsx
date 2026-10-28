import type { Editor } from "@tiptap/core";

/** Häufige Formatierungen bleiben auf Touch-Geräten ohne Hover erreichbar. */
export function MobileNoteToolbar({ editor, onLink }: { editor: Editor; onLink: () => void }) {
  return <div className="note-mobile-toolbar" role="toolbar" aria-label="Notiz bearbeiten" onMouseDown={(event) => event.preventDefault()}>
    <button type="button" aria-label="Block einfügen" onClick={() => editor.chain().focus().insertContent("/").run()}>+</button>
    <button type="button" aria-label="Fett formatieren" onClick={() => editor.chain().focus().toggleBold().run()}><strong>B</strong></button>
    <button type="button" aria-label="Aufgabenliste einfügen" onClick={() => editor.chain().focus().toggleTaskList().run()}>Aufgabe</button>
    <button type="button" aria-label="Link einfügen" onClick={onLink}>Link</button>
    <button type="button" aria-label="Rückgängig" onClick={() => editor.chain().focus().undo().run()}>↶</button>
    <button type="button" aria-label="Wiederholen" onClick={() => editor.chain().focus().redo().run()}>↷</button>
  </div>;
}
