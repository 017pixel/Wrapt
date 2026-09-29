import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { looksLikeMarkdown } from "./markdownBridge.js";

/**
 * Fügt Markdown aus der Zwischenablage als formatierte Blöcke ein — wie in
 * Notion. HTML- und Datei-Einfügungen überlässt die Extension bewusst Tiptap,
 * damit Webseiten-Inhalte und Bilder ihren regulären Weg behalten.
 */
export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => {
            const clipboard = event.clipboardData;
            if (!clipboard) return false;
            const html = clipboard.getData("text/html");
            const text = clipboard.getData("text/plain");
            const fileCount = clipboard.files?.length ?? 0;
            if (text === "" || html !== "" || fileCount > 0) return false;
            if (!looksLikeMarkdown(text)) return false;
            editor.commands.insertContent(text, { contentType: "markdown" });
            return true;
          },
        },
      }),
    ];
  },
});
