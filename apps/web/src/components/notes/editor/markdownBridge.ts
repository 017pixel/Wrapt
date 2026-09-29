import type { JSONContent } from "@tiptap/core";
import type { MarkdownManager } from "@tiptap/markdown";

/**
 * Markdown-Brücke für Notizen.
 *
 * Standardblöcke und die eigenen Container (Callout, Toggle, Spalten, TOC)
 * übersetzt `@tiptap/markdown` selbst über Pandoc-Direktiven:
 *
 * - Callout:   `:::callout {variant="info" title="Titel"}` … `:::`
 * - Toggle:    `:::details` … `:::`
 * - Spalten:   `:::columnList` mit `:::column` … `:::`
 * - TOC:       `:::tableOfContents :::`
 *
 * Diese Datei bleibt bewusst dünn: Sie kapselt Parsen und Serialisieren, damit
 * Tests den vollständigen Rundlauf (Markdown → Dokument → Markdown) prüfen
 * können, ohne den Editor zu starten.
 */

/** Sammelt Textinhalt ohne Formatierung (für Titel und Vergleiche). */
export function nodeText(node: JSONContent | undefined): string {
  if (!node) return "";
  if (typeof node.text === "string") return node.text;
  return (node.content ?? []).map(nodeText).join("");
}

/** Erkennt, ob eingefügter Text wie Markdown aussieht (mehrzeilig, Struktur). */
export function looksLikeMarkdown(text: string): boolean {
  if (!/[\n\r]/.test(text)) return false;
  return (
    /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|:::)/m.test(text) ||
    /^\s*\[[ xX]\]\s/m.test(text) ||
    /\|[^|\n]+\|[^|\n]+\|/.test(text) ||
    /^---+$/m.test(text)
  );
}

/** Markdown in ein Tiptap-Dokument übersetzen. */
export function parseNoteMarkdown(manager: MarkdownManager, markdown: string): JSONContent {
  if (markdown.trim() === "") {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return manager.parse(markdown);
}

/** Tiptap-Dokument in Markdown speichern. */
export function serializeNoteMarkdown(manager: MarkdownManager, doc: JSONContent): string {
  return manager.serialize(doc);
}
