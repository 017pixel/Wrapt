// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteMention } from "./NoteMention.js";
import { insertNoteReferenceInEditor } from "./noteReferences.js";
import { slashCommands } from "./slashCommands.js";

const editors: Editor[] = [];

function createEditor(content: string) {
  const editor = new Editor({
    extensions: [StarterKit, NoteMention],
    content: `<p>${content}</p>`,
  });
  editors.push(editor);
  return editor;
}

afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));

describe("Notizverweise im Editor", () => {
  it("nutzt den letzten freien Absatz für angehängte Unterseiten", () => {
    const editor = createEditor("Inhalt");
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: "paragraph" });
    expect(insertNoteReferenceInEditor(editor, { id: "kind", title: "Unterseite" })).toBe(true);
    expect(editor.getJSON().content).toHaveLength(2);
    expect(editor.getJSON().content?.[1]?.content?.[0]).toMatchObject({ type: "noteMention", attrs: { noteId: "kind" } });
  });

  it("fügt den Slash-Verweis direkt an der Schreibposition ein", () => {
    const editor = createEditor("Vor Nach");
    editor.commands.setTextSelection(5);

    expect(insertNoteReferenceInEditor(editor, { id: "seite-b", title: "Einkauf" }, true)).toBe(true);

    const content = editor.getJSON().content?.[0]?.content;
    expect(content?.map((node) => node.type)).toEqual(["text", "noteMention", "text"]);
    expect(content?.[1]).toMatchObject({ type: "noteMention", attrs: { noteId: "seite-b", label: "Einkauf" } });
  });

  it("fordert beim Slash-Befehl einen Verweis an der Cursorposition an", () => {
    const editor = createEditor("Vor /page");
    const createSubpage = vi.fn();
    const command = slashCommands.find((item) => item.id === "page");

    command?.run(editor, { from: 5, to: 10 }, { pickFile: vi.fn(), createSubpage });

    expect(createSubpage).toHaveBeenCalledExactlyOnceWith(true);
    expect(editor.getText()).toBe("Vor ");
  });
});
