import { Node, createBlockMarkdownSpec, mergeAttributes } from "@tiptap/core";

export const calloutVariants = ["info", "ok", "warn", "bad", "neutral"] as const;
export type CalloutVariant = (typeof calloutVariants)[number];

export interface CalloutOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attributes?: { variant?: CalloutVariant; title?: string | null }) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

/**
 * Notion-Callout: farbige Fläche mit optionalem Titel. In Markdown wird er als
 * Pandoc-Direktive gespeichert (`:::callout {variant="info"}`), damit der
 * Rundlauf verlustfrei bleibt.
 */
export const Callout = Node.create<CalloutOptions>({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  ...createBlockMarkdownSpec({
    nodeName: "callout",
    allowedAttributes: ["variant", "title"],
  }),

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      variant: {
        default: "info",
        parseHTML: (element) => {
          const value = element.getAttribute("data-callout-variant");
          return (calloutVariants as readonly string[]).includes(value ?? "") ? value : "info";
        },
        renderHTML: (attributes) => ({ "data-callout-variant": attributes.variant }),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-callout-title"),
        renderHTML: (attributes) =>
          attributes.title === null ? {} : { "data-callout-title": attributes.title },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-callout": "" }, this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attributes = {}) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attributes),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});
