// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vitest";
import { createNotesExtensions } from "./extensions.js";

interface SimpleNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: SimpleNode[];
  text?: string;
}

function contentOf(editor: Editor): SimpleNode[] {
  return (editor.getJSON().content ?? []) as SimpleNode[];
}

function firstOfType(nodes: SimpleNode[], type: string): SimpleNode | undefined {
  return nodes.find((node) => node.type === type);
}

const editors: Editor[] = [];

function createEditor() {
  const element = document.createElement("div");
  document.body.appendChild(element);
  const editor = new Editor({
    element,
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
  editors.push(editor);
  return editor;
}

/** Simuliert echtes Tippen: Zeichen für Zeichen durch die Eingaberegeln. */
async function typeChars(editor: Editor, text: string) {
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const handled = editor.view.someProp("handleTextInput", (handler) =>
      handler(editor.view, from, to, char, () => editor.state.tr),
    );
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(char, from, to));
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

describe("Notiz-Editor Eingaberegeln", () => {
  it("wandelt Markdown-Kürzel am Zeilenanfang in Blöcke um", async () => {
    const cases: Array<[string, string]> = [
      ["## ", "heading"],
      ["- ", "bulletList"],
      ["1. ", "orderedList"],
      ["[] ", "taskList"],
      ["> ", "blockquote"],
      ["---", "horizontalRule"],
    ];
    for (const [input, expected] of cases) {
      const editor = createEditor();
      await typeChars(editor, input);
      expect(contentOf(editor).map((node) => node.type)).toContain(expected);
      editor.destroy();
    }
  });

  it("verschachtelt keine Liste und entfernt den redundanten Marker", async () => {
    const editor = createEditor();
    await typeChars(editor, "- ");
    await typeChars(editor, "eins");
    editor.commands.enter();
    await typeChars(editor, "- ");
    await typeChars(editor, "zwei");

    const lists = contentOf(editor).filter((node) => node.type === "bulletList");
    expect(lists).toHaveLength(1);
    expect(lists[0]?.content).toHaveLength(2);
    // Der redundante Marker verschwindet; der Text bleibt sauber für den Markdown-Rundlauf.
    const secondItemText = lists[0]?.content?.[1]?.content?.[0]?.content?.[0]?.text ?? "";
    expect(secondItemText).toBe("zwei");
  });

  it("wechselt Zeilen in Aufgabenlisten weiter als Aufgaben", async () => {
    const editor = createEditor();
    await typeChars(editor, "[] ");
    await typeChars(editor, "eins");
    editor.commands.enter();
    await typeChars(editor, "zwei");

    const list = firstOfType(contentOf(editor), "taskList");
    expect(list).toBeTruthy();
    expect(list?.content).toHaveLength(2);
    expect(list?.content?.[1]?.attrs?.checked).toBe(false);
    expect(list?.content?.[1]?.content?.[0]?.content?.[0]?.text).toBe("zwei");
  });
});
