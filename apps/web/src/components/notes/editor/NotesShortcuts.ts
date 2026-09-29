import { Extension, type Editor } from "@tiptap/core";

export interface NotesShortcutsOptions {
  onRequestLink: () => void;
}

function insertToggle(editor: Editor) {
  return editor
    .chain()
    .focus()
    .insertContent({
      type: "details",
      attrs: { open: true },
      content: [
        { type: "detailsSummary", content: [] },
        { type: "detailsContent", content: [{ type: "paragraph" }] },
      ],
    })
    .run();
}

/**
 * Notion-nahe Tastenkürzel: Blockumwandlung (Cmd/Strg+Alt+Zahl),
 * Formatierung und Block-Duplizieren.
 */
export const NotesShortcuts = Extension.create<NotesShortcutsOptions>({
  name: "notesShortcuts",

  addOptions() {
    return { onRequestLink: () => undefined };
  },

  addKeyboardShortcuts() {
    const editor = this.editor;
    const duplicateBlock = () => {
      const { state } = editor;
      const { $from } = state.selection;
      if ($from.depth < 1) return false;
      const node = $from.node(1);
      const after = $from.after(1);
      return editor
        .chain()
        .insertContentAt(after, node.toJSON())
        .focus(after + 1)
        .run();
    };

    return {
      "Mod-Alt-0": () => editor.chain().focus().setParagraph().run(),
      "Mod-Alt-1": () => editor.chain().focus().setHeading({ level: 1 }).run(),
      "Mod-Alt-2": () => editor.chain().focus().setHeading({ level: 2 }).run(),
      "Mod-Alt-3": () => editor.chain().focus().setHeading({ level: 3 }).run(),
      "Mod-Alt-4": () => editor.chain().focus().toggleTaskList().run(),
      "Mod-Alt-5": () => editor.chain().focus().toggleBulletList().run(),
      "Mod-Alt-6": () => editor.chain().focus().toggleOrderedList().run(),
      "Mod-Alt-7": () => insertToggle(editor),
      "Mod-Alt-8": () => editor.chain().focus().setCodeBlock({ language: "plaintext" }).run(),
      "Mod-Shift-s": () => editor.chain().focus().toggleStrike().run(),
      "Mod-e": () => editor.chain().focus().toggleCode().run(),
      // Nur mit Auswahl wird daraus ein Link; sonst gehört Mod-k der Suche (⌘K).
      "Mod-k": () => {
        if (editor.state.selection.empty) return false;
        this.options.onRequestLink();
        return true;
      },
      "Mod-d": () => duplicateBlock(),
    };
  },
});
