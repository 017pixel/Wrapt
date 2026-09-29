import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { createNotesExtensions } from "./extensions.js";
import { looksLikeMarkdown, nodeText, parseNoteMarkdown, serializeNoteMarkdown } from "./markdownBridge.js";

const manager = new MarkdownManager({
  extensions: createNotesExtensions({
    placeholder: "Notiz schreiben…",
    uploadFile: async () => "https://example.invalid/file",
    slashContext: () => ({
      pickFile: () => undefined,
      createSubpage: () => undefined,
      pickEmoji: () => undefined,
    }),
    onRequestLink: () => undefined,
  }),
});

function roundtrip(markdown: string): string {
  const doc = parseNoteMarkdown(manager, markdown);
  return serializeNoteMarkdown(manager, doc);
}

/** Nach einem Rundlauf muss ein zweiter identisch bleiben (stabiler Fixpunkt). */
function expectStable(markdown: string) {
  const first = roundtrip(markdown);
  const second = roundtrip(first);
  expect(second).toBe(first);
  return first;
}

describe("markdown-brücke", () => {
  it("übersetzt Überschriften, Listen, Todos, Zitat und Trenner", () => {
    const result = expectStable(
      [
        "# Titel",
        "",
        "## Abschnitt",
        "",
        "Ein Absatz mit **fett**, *kursiv*, ~~durch~~ und `code`.",
        "",
        "- Punkt eins",
        "- Punkt zwei",
        "",
        "1. Erster",
        "2. Zweiter",
        "",
        "- [ ] offen",
        "- [x] erledigt",
        "",
        "> Zitat",
        "",
        "---",
      ].join("\n"),
    );
    expect(result).toContain("# Titel");
    expect(result).toContain("## Abschnitt");
    expect(result).toContain("**fett**");
    expect(result).toContain("- [ ] offen");
    expect(result).toContain("- [x] erledigt");
    expect(result).toContain("> Zitat");
    expect(result).toContain("---");
  });

  it("bewahrt migrierte Task-Metadaten als verschachtelte Listen", () => {
    const result = expectStable("- [ ] Abgeben\n  - ID: task-1\n  - Fällig am: 2026-09-30");
    expect(result).toContain("- [ ] Abgeben");
    expect(result).toContain("ID: task-1");
    expect(result).toContain("Fällig am: 2026-09-30");
  });

  it("erhält Codeblöcke mit Sprache und Tabellen", () => {
    const result = expectStable(
      [
        "```ts",
        "const x: number = 1;",
        "```",
        "",
        "| Spalte A | Spalte B |",
        "| --- | --- |",
        "| eins | zwei |",
      ].join("\n"),
    );
    expect(result).toContain("```ts");
    expect(result).toContain("const x: number = 1;");
    expect(result).toMatch(/\| eins\s+\|/);
  });

  it("erhält Callouts als Direktive", () => {
    const result = expectStable(':::callout {variant="warn" title="Achtung"}\n\nBitte prüfen.\n\n:::');
    expect(result).toContain(':::callout {variant="warn" title="Achtung"}');
    expect(result).toContain("Bitte prüfen.");
  });

  it("erhält Toggles als details-Direktive", () => {
    const result = expectStable(":::details\n\nVerborgener Inhalt\n\n:::");
    expect(result).toContain(":::details");
    expect(result).toContain("Verborgener Inhalt");
  });

  it("erhält Spalten als verschachtelte Direktiven", () => {
    const result = expectStable(
      ":::columnList\n\n:::column\n\nLinks\n\n:::\n\n:::column\n\nRechts\n\n:::\n\n:::",
    );
    expect(result).toContain(":::columnList");
    expect(result).toContain("Links");
    expect(result).toContain("Rechts");
  });

  it("erhält das Inhaltsverzeichnis als eigenen Block", () => {
    const doc = parseNoteMarkdown(manager, ":::tableOfContents :::");
    expect(doc.content?.[0]?.type).toBe("tocBlock");
    const result = expectStable(":::tableOfContents :::");
    expect(result).toContain(":::tableOfContents");
  });

  it("erhält mathematische Formeln", () => {
    const result = expectStable("Inline $x^2$ und Block:\n\n$$\n\\frac{1}{2}\n$$");
    expect(result).toContain("$x^2$");
    expect(result).toContain("\\frac{1}{2}");
  });

  it("erhält Bild- und Linkziele", () => {
    const result = expectStable(
      "![Alt-Text](https://example.invalid/bild.png)\n\n[Wrapt](https://example.invalid)",
    );
    expect(result).toContain("![Alt-Text](https://example.invalid/bild.png)");
    expect(result).toContain("[Wrapt](https://example.invalid)");
  });

  it("erkennt Markdown-Einfügungen und ignoriert Klartext", () => {
    expect(looksLikeMarkdown("# Titel\n\nText")).toBe(true);
    expect(looksLikeMarkdown("- eins\n- zwei")).toBe(true);
    expect(looksLikeMarkdown("- [ ] Aufgabe\n- [x] Fertig")).toBe(true);
    expect(looksLikeMarkdown("| a | b |\n| --- | --- |")).toBe(true);
    expect(looksLikeMarkdown("Nur eine Zeile")).toBe(false);
    expect(looksLikeMarkdown("Ein Satz.\nNoch ein Satz.")).toBe(false);
  });

  it("erhält Notiz-Verweise als Inline-Shortcode", () => {
    const doc = parseNoteMarkdown(manager, 'Siehe [noteMention noteId="3f0b6f5e-1f9d-4f0b-9a3c-2b8b8f0d5a11" label="Einkauf"].');
    const paragraph = doc.content?.[0];
    expect(paragraph?.content?.some((child) => child.type === "noteMention")).toBe(true);
    const result = expectStable('Siehe [noteMention noteId="3f0b6f5e-1f9d-4f0b-9a3c-2b8b8f0d5a11" label="Einkauf"].');
    expect(result).toContain("noteMention");
    expect(result).toContain("Einkauf");
  });

  it("rundläuft Randfälle stabil", () => {
    const cases = [
      "",
      "   ",
      "\n\n",
      "Leerer Absatz:\n\n&nbsp;\n\nEnde",
      "Text mit | Pipe",
      "Ein :smile: Emoji und unicode 😀",
      "<span style=\"color: #e5736f\">Rot</span>",
      "`inline | code` und ~~alt~~",
      ":::callout {variant=\"bad\" title=\"A|B\"}\n\nInhalt\n\n:::",
      "![Bild](https://example.invalid/a.png \"Titel\")",
      "> Zitat\n> zweite Zeile",
    ];
    for (const markdown of cases) {
      const first = serializeNoteMarkdown(manager, parseNoteMarkdown(manager, markdown));
      const second = serializeNoteMarkdown(manager, parseNoteMarkdown(manager, first));
      expect(second, `Fall ${JSON.stringify(markdown.slice(0, 30))}`).toBe(first);
    }
  });

  it("liest Text aus Knoten für Titel und Vorschauen", () => {
    expect(nodeText({ type: "paragraph", content: [{ type: "text", text: "Hallo" }] })).toBe("Hallo");
    expect(nodeText({ type: "detailsSummary", content: [{ type: "text", text: "Mehr" }] })).toBe("Mehr");
    expect(nodeText(undefined)).toBe("");
  });
});
