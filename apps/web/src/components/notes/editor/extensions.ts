import Color from "@tiptap/extension-color";
import BulletList from "@tiptap/extension-bullet-list";
import { Details, DetailsContent, DetailsSummary } from "@tiptap/extension-details";
import FileHandler from "@tiptap/extension-file-handler";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { BlockMath, InlineMath } from "@tiptap/extension-mathematics";
import OrderedList from "@tiptap/extension-ordered-list";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
import TableOfContents from "@tiptap/extension-table-of-contents";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Typography from "@tiptap/extension-typography";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { Editor, JSONContent, MarkdownRendererHelpers } from "@tiptap/core";
import type { Extensions } from "@tiptap/react";
import { Callout } from "./CalloutNode.js";
import { CalloutView } from "./CalloutView.js";
import { CodeBlockView } from "./CodeBlockView.js";
import { Column, ColumnList } from "./ColumnsNodes.js";
import { bulletListRule, orderedListRule, taskItemRule } from "./listInputRules.js";
import { LinkSafety } from "./LinkSafety.js";
import { lowlight } from "./lowlight.js";
import { MarkdownPaste } from "./MarkdownPaste.js";
import { NoteMention } from "./NoteMention.js";
import { NoteMentionView } from "./NoteMentionView.js";
import { NotesShortcuts } from "./NotesShortcuts.js";
import { SlashCommand } from "./SlashCommandExtension.js";
import type { SlashCommandContext } from "./slashCommands.js";
import { TableOfContentsBlock } from "./TableOfContentsNode.js";
import { TableOfContentsView } from "./TableOfContentsView.js";

/**
 * Farbmarkierung als HTML-Span: Markdown kennt keine Textfarben, HTML ist die
 * portable Brücke. Der Parser liest `style` über die Tiptap-parseHTML-Regeln
 * von TextStyle/Color wieder ein.
 */
const TextStyleWithMarkdown = TextStyle.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const style = node.marks?.find((mark) => mark.type === "textStyle")?.attrs as
      | { color?: string | null }
      | undefined;
    const color = style?.color ?? null;
    if (color === null) return helpers.renderChildren(node);
    return `<span style="color: ${color}">${helpers.renderChildren(node)}</span>`;
  },
});

/**
 * Callout, Codeblock und Inhaltsverzeichnis bekommen eigene NodeViews.
 */
const CalloutWithView = Callout.extend({
  addNodeView: () => ReactNodeViewRenderer(CalloutView),
});

const CodeBlockWithView = CodeBlockLowlight.extend({
  addNodeView: () => ReactNodeViewRenderer(CodeBlockView),
});

const TableOfContentsWithView = TableOfContentsBlock.extend({
  addNodeView: () => ReactNodeViewRenderer(TableOfContentsView),
});

const NoteMentionWithView = NoteMention.extend({
  addNodeView: () => ReactNodeViewRenderer(NoteMentionView),
});

// Listen-Umwandlung wie in Notion: außerhalb einer Liste umwandeln,
// innerhalb einer Liste den Marker als Text stehen lassen.
const NotionBulletList = BulletList.extend({ addInputRules: () => [bulletListRule] });
const NotionOrderedList = OrderedList.extend({ addInputRules: () => [orderedListRule] });
const NotionTaskItem = TaskItem.extend({ addInputRules: () => [taskItemRule] });

export interface NotesExtensionOptions {
  placeholder: string;
  /** Lädt eine Datei hoch und liefert die öffentlich erreichbare URL zurück. */
  uploadFile: (file: File) => Promise<string>;
  /** Host-Aktionen für das Slash-Menü (Datei, Unterseite). */
  slashContext: () => SlashCommandContext;
  /** Öffnet den Link-Dialog (Cmd+K). */
  onRequestLink: () => void;
}

function fileHandlerExtensions(uploadFile: NotesExtensionOptions["uploadFile"]) {
  const insertFile = (editor: Editor, file: File, pos: number) => {
    void uploadFile(file)
      .then((url) => {
        const content: JSONContent = file.type.startsWith("image/")
          ? { type: "image", attrs: { src: url, alt: file.name } }
          : {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: file.name,
                  marks: [{ type: "link", attrs: { href: url } }],
                },
              ],
            };
        editor.chain().focus().insertContentAt(pos, content).run();
      })
      .catch(() => {
        // Upload-Fehler bleiben bewusst still: Der Upload läuft über die
        // bestehende Asset-API, die Fehler bereits anderweitig sichtbar macht.
      });
  };

  return FileHandler.configure({
    onDrop: (editor, files, pos) => {
      files.forEach((file) => insertFile(editor, file, pos));
    },
    onPaste: (editor, files) => {
      files.forEach((file) => insertFile(editor, file, editor.state.selection.from));
    },
  });
}

/** Das komplette Extension-Set für Notizen. */
export function createNotesExtensions(options: NotesExtensionOptions): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      bulletList: false,
      orderedList: false,
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
      },
    }),
    CodeBlockWithView.configure({ lowlight, defaultLanguage: "plaintext" }),
    Markdown.configure({ indentation: { style: "space", size: 2 } }),
    Placeholder.configure({ placeholder: options.placeholder }),
    Typography,
    NotionBulletList,
    NotionOrderedList,
    TaskList,
    NotionTaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: true, allowTableNodeSelection: true } }),
    Details.configure({
      persist: true,
      HTMLAttributes: { class: "wrapt-details" },
      renderToggleButton: ({ element, isOpen }) => {
        element.textContent = isOpen ? "▾" : "▸";
        element.setAttribute("aria-label", isOpen ? "Einklappen" : "Ausklappen");
      },
    }),
    DetailsSummary,
    DetailsContent,
    InlineMath,
    BlockMath,
    TableOfContents.configure({ anchorTypes: ["heading"] }),
    TableOfContentsWithView,
    Image.configure({ inline: false, allowBase64: false }),
    TextStyleWithMarkdown,
    Color.configure({ types: ["textStyle"] }),
    Highlight.configure({ multicolor: true }),
    CalloutWithView,
    ColumnList,
    Column,
    NoteMentionWithView,
    MarkdownPaste,
    LinkSafety,
    SlashCommand.configure({ context: options.slashContext }),
    NotesShortcuts.configure({ onRequestLink: options.onRequestLink }),
    fileHandlerExtensions(options.uploadFile),
  ];
}
