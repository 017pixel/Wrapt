import { Node } from "@tiptap/core";

/** Das portable Fälligkeitsfeld erscheint im Editor als lesbares Datum. */
export const TaskDueDate = Node.create({
  name: "taskDueDate", group: "inline", inline: true, atom: true,
  addAttributes: () => ({ date: { default: "", parseHTML: (element: HTMLElement) => element.dataset.noteDue ?? "" } }),
  parseHTML: () => [{ tag: "span[data-note-due]" }],
  renderHTML({ node }) {
    const date = String(node.attrs.date);
    const value = new Date(`${date}T12:00:00`);
    const label = Number.isFinite(value.getTime()) ? value.toLocaleDateString("de-DE") : date;
    return ["span", { "data-note-due": date, class: "note-task-due" }, `Fällig ${label}`];
  },
  markdownTokenizer: {
    name: "taskDueDate", level: "inline", start: (source) => source.indexOf("[due:: "),
    tokenize: (source) => {
      const match = /^\[due:: (\d{4}-\d{2}-\d{2})\]/.exec(source);
      return match ? { type: "taskDueDate", raw: match[0], date: match[1]! } : undefined;
    },
  },
  parseMarkdown: (token) => ({ type: "taskDueDate", attrs: { date: String(token.date) } }),
  renderMarkdown: (node) => `[due:: ${String(node.attrs?.date ?? "")}]`,
});
