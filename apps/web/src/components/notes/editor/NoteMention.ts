import { Node, createInlineMarkdownSpec, mergeAttributes } from "@tiptap/core";

export interface NoteMentionOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * Inline-Verweis auf eine andere Notiz. In Markdown wird er als
 * `[noteMention noteId="…" label="…"]` gespeichert; die NodeView öffnet die
 * verlinkte Notiz per Klick.
 */
export const NoteMention = Node.create<NoteMentionOptions>({
  name: "noteMention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      noteId: { default: null },
      label: { default: "Notiz" },
    };
  },

  ...createInlineMarkdownSpec({
    nodeName: "noteMention",
    selfClosing: true,
    allowedAttributes: ["noteId", "label"],
  }),

  parseHTML() {
    return [{ tag: "span[data-note-mention]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-note-mention": "" }, this.options.HTMLAttributes, HTMLAttributes),
      HTMLAttributes.label ?? "Notiz",
    ];
  },
});
