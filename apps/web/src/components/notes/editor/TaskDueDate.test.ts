// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { expect, it } from "vitest";
import { TaskDueDate } from "./TaskDueDate";
it("zeigt ein lesbares Datum und erhält das portable Markdown-Feld", () => {
  const editor = new Editor({ extensions: [StarterKit, Markdown, TaskDueDate] });
  try {
    const doc = editor.storage.markdown.manager.parse("Prüfen [due:: 2026-11-01]");
    editor.commands.setContent(doc);
    expect(editor.getHTML()).toContain("Fällig 1.11.2026");
    expect(editor.storage.markdown.manager.serialize(editor.getJSON())).toContain("[due:: 2026-11-01]");
  } finally { editor.destroy(); }
});
