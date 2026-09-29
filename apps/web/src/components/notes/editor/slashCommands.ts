import type { Editor } from "@tiptap/core";
import type { Range } from "@tiptap/core";

export interface SlashCommandItem {
  id: string;
  label: string;
  description: string;
  group: "Basis" | "Blöcke" | "Fortgeschritten" | "Einbetten";
  keywords: string[];
  /** Kurzzeichen für die Liste (bewusst textlich, keine Emojis). */
  hint?: string;
  run: (editor: Editor, range: Range, context: SlashCommandContext) => void;
}

export interface SlashCommandContext {
  /** Öffnet den Dateidialog und fügt das Ergebnis ein (Bild oder Datei). */
  pickFile: () => void;
  /** Erstellt eine Unterseite unter dieser Notiz, verlinkt sie und öffnet sie. */
  createSubpage: () => void;
  /** Öffnet die interne Seitensuche für einen Verweis auf eine vorhandene Seite. */
  pickNoteLink?: () => void;
}

function chain(editor: Editor, range: Range) {
  return editor.chain().focus().deleteRange(range);
}

export const slashCommands: SlashCommandItem[] = [
  {
    id: "text",
    label: "Text",
    description: "Einfacher Absatz",
    group: "Basis",
    keywords: ["text", "absatz", "paragraph", "plain"],
    hint: "Text",
    run: (editor, range) => chain(editor, range).setParagraph().run(),
  },
  {
    id: "h1",
    label: "Überschrift 1",
    description: "Große Überschrift",
    group: "Basis",
    keywords: ["h1", "überschrift", "heading", "titel", "#"],
    hint: "#",
    run: (editor, range) => chain(editor, range).setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "Überschrift 2",
    description: "Mittlere Überschrift",
    group: "Basis",
    keywords: ["h2", "überschrift", "heading", "##"],
    hint: "##",
    run: (editor, range) => chain(editor, range).setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "Überschrift 3",
    description: "Kleine Überschrift",
    group: "Basis",
    keywords: ["h3", "überschrift", "heading", "###"],
    hint: "###",
    run: (editor, range) => chain(editor, range).setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "Aufzählung",
    description: "Liste mit Punkten",
    group: "Basis",
    keywords: ["liste", "bullet", "punkte", "ul", "-"],
    hint: "-",
    run: (editor, range) => chain(editor, range).toggleBulletList().run(),
  },
  {
    id: "number",
    label: "Nummerierte Liste",
    description: "Liste mit Zahlen",
    group: "Basis",
    keywords: ["liste", "number", "nummeriert", "ol", "1."],
    hint: "1.",
    run: (editor, range) => chain(editor, range).toggleOrderedList().run(),
  },
  {
    id: "todo",
    label: "Aufgabe",
    description: "Checkbox zum Abhaken",
    group: "Basis",
    keywords: ["todo", "aufgabe", "checkbox", "task", "[]"],
    hint: "[]",
    run: (editor, range) => chain(editor, range).toggleTaskList().run(),
  },
  {
    id: "toggle",
    label: "Toggle",
    description: "Ein- und ausklappbarer Abschnitt",
    group: "Basis",
    keywords: ["toggle", "ausklappen", "details", "einklappen", ">"],
    hint: ">",
    run: (editor, range) =>
      chain(editor, range)
        .insertContent({
          type: "details",
          attrs: { open: true },
          content: [
            { type: "detailsSummary", content: [] },
            { type: "detailsContent", content: [{ type: "paragraph" }] },
          ],
        })
        .run(),
  },
  {
    id: "quote",
    label: "Zitat",
    description: "Hervorgehobener Abschnitt",
    group: "Blöcke",
    keywords: ["zitat", "quote", "blockquote", '"'],
    hint: '"',
    run: (editor, range) => chain(editor, range).toggleBlockquote().run(),
  },
  {
    id: "callout",
    label: "Callout",
    description: "Hinweis mit Farbe und Titel",
    group: "Blöcke",
    keywords: ["callout", "hinweis", "warnung", "info", "box"],
    run: (editor, range) =>
      chain(editor, range)
        .insertContent({
          type: "callout",
          attrs: { variant: "info", title: null },
          content: [{ type: "paragraph" }],
        })
        .run(),
  },
  {
    id: "code",
    label: "Codeblock",
    description: "Code mit Sprachauswahl",
    group: "Blöcke",
    keywords: ["code", "codeblock", "snippet", "```"],
    hint: "```",
    run: (editor, range) => chain(editor, range).setCodeBlock({ language: "plaintext" }).run(),
  },
  {
    id: "divider",
    label: "Trenner",
    description: "Waagerechte Trennlinie",
    group: "Blöcke",
    keywords: ["trenner", "divider", "linie", "hr", "---"],
    hint: "---",
    run: (editor, range) => chain(editor, range).setHorizontalRule().run(),
  },
  {
    id: "table",
    label: "Tabelle",
    description: "Tabelle mit Kopfzeile",
    group: "Blöcke",
    keywords: ["tabelle", "table", "raster"],
    run: (editor, range) =>
      chain(editor, range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: "columns",
    label: "Spalten",
    description: "Zwei Spalten nebeneinander",
    group: "Blöcke",
    keywords: ["spalten", "columns", "layout"],
    run: (editor, range) => chain(editor, range).insertColumns(2).run(),
  },
  {
    id: "toc",
    label: "Inhaltsverzeichnis",
    description: "Übersicht aller Überschriften",
    group: "Fortgeschritten",
    keywords: ["inhalt", "toc", "verzeichnis", "übersicht"],
    run: (editor, range) => chain(editor, range).insertTableOfContents().run(),
  },
  {
    id: "math",
    label: "Formel",
    description: "Mathematische Formel (LaTeX)",
    group: "Fortgeschritten",
    keywords: ["formel", "math", "latex", "gleichung"],
    // Explizite Position: Nach dem Löschen des Suchtexts wäre die Auswahl des
    // Editors veraltet und die Formel würde außerhalb des Dokuments landen.
    run: (editor, range) =>
      chain(editor, range).insertBlockMath({ latex: "a^2 + b^2 = c^2", pos: range.from }).run(),
  },
  {
    id: "page",
    label: "Unterseite",
    description: "Neue Seite unter dieser Notiz anlegen",
    group: "Basis",
    keywords: ["unterseite", "page", "seite", "subpage", "verlinken", "notiz"],
    hint: "Seite",
    // Der Suchtext verschwindet sofort; die Seite entsteht danach asynchron.
    run: (editor, range, context) => {
      chain(editor, range).run();
      context.createSubpage();
    },
  },
  {
    id: "link",
    label: "Seitenverweis",
    description: "Eine vorhandene Notiz verlinken",
    group: "Basis",
    keywords: ["link", "seite", "notiz", "verweis", "referenz", "mention"],
    hint: "Link",
    run: (editor, range, context) => {
      chain(editor, range).run();
      context.pickNoteLink?.();
    },
  },
  {
    id: "image",
    label: "Bild oder Datei",
    description: "Datei hochladen und einfügen",
    group: "Einbetten",
    keywords: ["bild", "image", "datei", "file", "upload", "anhang"],
    run: (_editor, _range, context) => context.pickFile(),
  },
];

/** Filtert Befehle für die Slash-Suche; Treffer auf Wortanfänge zuerst. */
export function filterSlashCommands(query: string): SlashCommandItem[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return slashCommands;
  const scored = slashCommands
    .map((command) => {
      const haystacks = [command.label, ...command.keywords, command.group].map((value) =>
        value.toLowerCase(),
      );
      let score = 0;
      for (const value of haystacks) {
        if (value === needle) score = Math.max(score, 4);
        else if (value.startsWith(needle)) score = Math.max(score, 3);
        else if (value.includes(needle)) score = Math.max(score, 2);
      }
      return { command, score };
    })
    .filter((entry) => entry.score > 0);
  return scored
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.command);
}
