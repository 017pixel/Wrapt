// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbitSnippetEditor } from "./OrbitSnippetEditor";

const clipboardMock = vi.hoisted(() => vi.fn());

vi.mock("../../lib/clipboard", () => ({ writeClipboardText: clipboardMock }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Orbit-Code-Snippet", () => {
  it("kopiert den gespeicherten Inhalt und fügt Einrückung ein", async () => {
    const onContentChange = vi.fn();
    render(
      <OrbitSnippetEditor
        title="Beispiel"
        language="typescript"
        content="const value = 1;"
        onLanguageChange={vi.fn()}
        onContentChange={onContentChange}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "Beispiel Code bearbeiten" }) as HTMLTextAreaElement;
    editor.setSelectionRange(6, 6);
    fireEvent.keyDown(editor, { key: "Tab" });
    expect(onContentChange).toHaveBeenCalledWith("const   value = 1;");

    fireEvent.click(screen.getByRole("button", { name: "Code kopieren" }));
    expect(clipboardMock).toHaveBeenCalledWith("const value = 1;");
    expect((await screen.findByRole("status")).textContent).toBe("Code kopiert");
  });
});
