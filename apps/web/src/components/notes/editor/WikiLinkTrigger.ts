import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

/** [[ öffnet die vorhandene Seitenauswahl und setzt danach einen stabilen ID-Verweis ein. */
export const WikiLinkTrigger = Extension.create<{ open: () => void }>({
  name: "wikiLinkTrigger",
  addOptions: () => ({ open: () => undefined }),
  addProseMirrorPlugins() {
    const editor = this.editor;
    const open = this.options.open;
    return [new Plugin({ props: { handleTextInput: (view, from, to, text) => {
      if (text !== "[" || from !== to || editor.isActive("codeBlock") || editor.isActive("code")) return false;
      if (view.state.doc.textBetween(Math.max(0, from - 1), from) !== "[") return false;
      view.dispatch(view.state.tr.delete(from - 1, from));
      open();
      return true;
    } } })];
  },
});
