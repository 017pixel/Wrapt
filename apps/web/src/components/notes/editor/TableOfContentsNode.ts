import { Node, createAtomBlockMarkdownSpec } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tocBlock: {
      insertTableOfContents: () => ReturnType;
    };
  }
}

/**
 * Inhaltsverzeichnis als Block. Die eigentliche Auswertung liefert die
 * `TableOfContents`-Extension; dieser Knoten ist nur der sichtbare Anker und
 * wird in Markdown als `:::tableOfContents :::` gespeichert.
 */
export const TableOfContentsBlock = Node.create({
  name: "tocBlock",
  group: "block",
  atom: true,
  selectable: true,

  ...createAtomBlockMarkdownSpec({ nodeName: "tocBlock", name: "tableOfContents" }),

  parseHTML() {
    return [{ tag: "div[data-wrapt-toc]" }];
  },

  renderHTML() {
    return ["div", { "data-wrapt-toc": "" }];
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name }),
    };
  },
});
