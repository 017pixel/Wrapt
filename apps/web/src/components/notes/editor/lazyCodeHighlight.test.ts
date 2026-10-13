// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { expect, it, vi } from "vitest";
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
