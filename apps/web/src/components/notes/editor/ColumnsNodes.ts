import { Node, createBlockMarkdownSpec, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columnList: {
      insertColumns: (columns?: number) => ReturnType;
      removeColumns: () => ReturnType;
    };
  }
}

/**
 * Notion-Spalten: `columnList` hält zwei bis vier `column`-Blöcke. In Markdown
 * werden sie als verschachtelte Pandoc-Direktiven gespeichert
 * (`:::columnList` mit `:::column`), damit der Rundlauf verlustfrei bleibt.
 */
export const ColumnList = Node.create({
  name: "columnList",
  group: "block",
  content: "column+",
  defining: true,
  isolating: true,

  ...createBlockMarkdownSpec({ nodeName: "columnList" }),

  parseHTML() {
    return [{ tag: "div[data-wrapt-columns]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-wrapt-columns": "" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertColumns:
        (count = 2) =>
        ({ chain }) => {
          const columns = Array.from({ length: Math.max(2, Math.min(4, count)) }, () => ({
            type: "column",
            content: [{ type: "paragraph" }],
          }));
          return chain().insertContent({ type: "columnList", content: columns }).run();
        },
      removeColumns:
        () =>
        ({ state, tr, dispatch }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth -= 1) {
            if ($from.node(depth).type.name === "columnList") {
              if (dispatch) {
                tr.replaceWith($from.before(depth), $from.after(depth), $from.node(depth).content);
              }
              return true;
            }
          }
          return false;
        },
    };
  },
});

export const Column = Node.create({
  name: "column",
  content: "block+",
  isolating: true,

  ...createBlockMarkdownSpec({ nodeName: "column", allowedAttributes: ["width"] }),

  addAttributes() {
    return {
      width: {
        default: null,
        parseHTML: (element) => {
          const value = Number(element.getAttribute("data-wrapt-column-width"));
          return Number.isFinite(value) && value > 0 ? value : null;
        },
        renderHTML: (attributes) =>
          attributes.width === null ? {} : { "data-wrapt-column-width": attributes.width },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-wrapt-column]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-wrapt-column": "" }, HTMLAttributes), 0];
  },
});
