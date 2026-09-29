import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const RELATIVE_PATTERN = /^(?:[/#?]|\.{1,2}\/)/;

/**
 * Linkziele können aus Markdown, Einfügungen oder fremden Quellen stammen.
 * `javascript:` und ähnliche Protokolle werden entfernt, damit kein Skript
 * über einen Link ausgeführt werden kann. Die Textstelle bleibt erhalten,
 * nur die Verknüpfung fällt weg.
 */
export function isSafeNoteHref(href: unknown): boolean {
  if (typeof href !== "string") return false;
  const trimmed = href.trim();
  if (trimmed === "") return false;
  if (RELATIVE_PATTERN.test(trimmed)) return true;
  try {
    return ALLOWED_PROTOCOLS.has(new URL(trimmed).protocol.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * ProseMirror-Plugin: Prüft nach jeder Änderung alle Linkziele und entfernt
 * unsichere Verknüpfungen, unabhängig davon, über welchen Weg sie hereinkamen
 * (Laden, Einfügen, Tippen).
 */
export const LinkSafety = Extension.create({
  name: "linkSafety",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("linkSafety"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const linkType = newState.schema.marks.link;
          if (!linkType) return null;

          const removals: Array<{ from: number; to: number }> = [];
          newState.doc.descendants((node, position) => {
            if (!node.isText) return;
            const link = node.marks.find((mark) => mark.type === linkType);
            if (!link || isSafeNoteHref(link.attrs.href)) return;
            removals.push({ from: position, to: position + node.nodeSize });
          });
          if (removals.length === 0) return null;

          const tr = newState.tr;
          for (const { from, to } of removals.sort((a, b) => b.from - a.from)) {
            tr.removeMark(from, to, linkType);
          }
          return tr;
        },
      }),
    ];
  },
});
