// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { createNotesExtensions } from "./extensions.js";
import { isSafeNoteHref } from "./LinkSafety.js";
import { parseNoteMarkdown } from "./markdownBridge.js";

const manager = new MarkdownManager({
  extensions: createNotesExtensions({
    placeholder: "x",
    uploadFile: async () => "https://example.invalid/f",
    slashContext: () => ({ pickFile: () => undefined, createSubpage: () => undefined, pickEmoji: () => undefined }),
    onRequestLink: () => undefined,
  }),
});

describe("Link-Sicherheit", () => {
  it("erlaubt nur unbedenkliche Protokolle", () => {
    expect(isSafeNoteHref("https://example.invalid")).toBe(true);
    expect(isSafeNoteHref("http://example.invalid")).toBe(true);
    expect(isSafeNoteHref("mailto:test@example.invalid")).toBe(true);
    expect(isSafeNoteHref("/notizen?note=1")).toBe(true);
    expect(isSafeNoteHref("#abschnitt")).toBe(true);
    expect(isSafeNoteHref("javascript:alert(1)")).toBe(false);
    expect(isSafeNoteHref("JavaScript:alert(1)")).toBe(false);
    expect(isSafeNoteHref("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeNoteHref("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeNoteHref("   ")).toBe(false);
    expect(isSafeNoteHref(undefined)).toBe(false);
  });

  it("entfernt unsichere Linkziele aus dem geladenen Dokument", async () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: createNotesExtensions({
        placeholder: "x",
        uploadFile: async () => "https://example.invalid/f",
        slashContext: () => ({ pickFile: () => undefined, createSubpage: () => undefined, pickEmoji: () => undefined }),
        onRequestLink: () => undefined,
      }),
    });
    editor.commands.setContent(
      parseNoteMarkdown(manager, "[klick](javascript:alert(1)) und [ok](https://example.invalid)"),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const links: string[] = [];
    editor.state.doc.descendants((node) => {
      for (const mark of node.marks) if (mark.type.name === "link") links.push(String(mark.attrs.href));
    });
    expect(links).toEqual(["https://example.invalid"]);
    expect(editor.getText()).toContain("klick");
    editor.destroy();
  });
});
