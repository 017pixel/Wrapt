// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { expect, it, vi } from "vitest";
import highlight from "highlight.js/lib/core";
import bash from "highlight.js-notes/lib/languages/bash";
import { lowlight } from "./lowlight";
import { lazyCodeHighlightPlugins } from "./lazyCodeHighlight";

it("dekoriert nach dem Import ohne Doc-/Selectionänderung oder Autosave", async () => {
  const update = vi.fn();
  const Code = CodeBlockLowlight.extend({ addProseMirrorPlugins() { return lazyCodeHighlightPlugins(this.parent?.() ?? []); } });
  const editor = new Editor({ extensions: [StarterKit.configure({ codeBlock: false }), Code.configure({ lowlight })],
    content: { type: "doc", content: [{ type: "codeBlock", attrs: { language: "rust" }, content: [{ type: "text", text: "fn main() { let answer = 42; }" }] }, { type: "paragraph" }] }, onUpdate: update });
  try {
    const doc = editor.state.doc;
    const selection = editor.state.selection;
    await vi.waitFor(() => expect(editor.view.dom.querySelector(".hljs-keyword")).toBeTruthy());
    expect(editor.state.doc).toBe(doc);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(update).not.toHaveBeenCalled();
    editor.commands.setTextSelection(2);
    editor.commands.updateAttributes("codeBlock", { language: "python" });
    await vi.waitFor(() => expect(lowlight.registered("python")).toBe(true));
    expect(editor.state.selection.from).toBe(2);
  } finally { editor.destroy(); }
});


it("öffnet Bash-Blöcke trotz fremder Registrierung vor dem Grammatikimport", async () => {
  highlight.registerLanguage("bash", bash);
  expect(lowlight.registered("bash")).toBe(false);
  const Code = CodeBlockLowlight.extend({ addProseMirrorPlugins() { return lazyCodeHighlightPlugins(this.parent?.() ?? []); } });
  const editor = new Editor({
    extensions: [StarterKit.configure({ codeBlock: false }), Code.configure({ lowlight })],
    content: { type: "doc", content: [{ type: "codeBlock", attrs: { language: "bash" }, content: [{ type: "text", text: 'echo "$HOME"' }] }] },
  });
  try {
    expect(editor.getText()).toContain('echo "$HOME"');
    await vi.waitFor(() => expect(editor.view.dom.querySelector(".hljs-built_in")).toBeTruthy());
    expect(editor.getJSON().content?.[0]?.attrs?.language).toBe("bash");
  } finally { editor.destroy(); }
});
