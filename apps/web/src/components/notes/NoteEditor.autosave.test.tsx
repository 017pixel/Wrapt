// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import type * as TiptapReact from "@tiptap/react";
import type { Note } from "@wrapt/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "../../lib/apiClient";
import { NoteEditor } from "./NoteEditor";

const runtime = vi.hoisted(() => ({ editor: null as Editor | null }));
vi.mock("@tiptap/react", async (importOriginal) => {
  const actual = await importOriginal<typeof TiptapReact>();
  return {
    ...actual,
    useEditor: (...args: Parameters<typeof actual.useEditor>) => {
      runtime.editor = actual.useEditor(...args);
      return runtime.editor;
    },
  };
});

const note = { id: "notiz-a", title: "Notiz", revision: 1, content: "Anfang Ende" } as Note;

function renderEditor(onSaved = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <NoteEditor note={note} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  const rerenderNote = (next: Note) => view.rerender(
    <QueryClientProvider client={client}>
      <NoteEditor note={next} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  if (!runtime.editor) throw new Error("Editor fehlt");
  return { editor: runtime.editor, rerenderNote };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("behält Dokument und Cursor bei einer eigenen Speicherbestätigung", async () => {
  vi.useFakeTimers();
  const saved = { ...note, content: "Anfang neu Ende", revision: 2 };
  vi.spyOn(apiClient, "saveNoteContent").mockResolvedValue({ status: "saved", note: saved });
  const { editor, rerenderNote } = renderEditor();
  act(() => editor.chain().setTextSelection(8).insertContent("neu ").run());
  const document = editor.state.doc;
  const selection = editor.state.selection.from;

  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  rerenderNote(saved);

  expect(editor.state.doc).toBe(document);
  expect(editor.state.selection.from).toBe(selection);
});

it("ignoriert verspätete ältere Antworten nach Löschen und Weiterschreiben", async () => {
  vi.useFakeTimers();
  type Result = Awaited<ReturnType<typeof apiClient.saveNoteContent>>;
  let finish!: (result: Result) => void;
  const pending = new Promise<Result>((resolve) => { finish = resolve; });
  const first = { ...note, content: "Erste Fassung", revision: 2 };
  const latest = { ...note, content: "Weitergeschrieben", revision: 3 };
  const save = vi.spyOn(apiClient, "saveNoteContent")
    .mockReturnValueOnce(pending)
    .mockResolvedValueOnce({ status: "saved", note: latest });
  const { editor, rerenderNote } = renderEditor();
  act(() => editor.commands.setContent("<p>Erste Fassung</p>"));
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  act(() => {
    editor.commands.clearContent();
    editor.commands.insertContent("Weitergeschrieben");
  });
  await act(async () => { finish({ status: "saved", note: first }); await pending; });
  rerenderNote(first);
  expect(editor.getText()).toBe("Weitergeschrieben");
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  // Der Eltern-Cache kann noch die erste Antwort enthalten, obwohl die
  // neueste Speicherung bereits bestätigt ist.
  expect(editor.getText()).toBe("Weitergeschrieben");
  rerenderNote(latest);
  rerenderNote(first);
  expect(editor.getText()).toBe("Weitergeschrieben");
  expect(save).toHaveBeenLastCalledWith(note.id, { content: "Weitergeschrieben", expectedRevision: 2 });
});

it("übernimmt eine echte externe Revision im unveränderten Editor", () => {
  const { editor, rerenderNote } = renderEditor();
  rerenderNote({ ...note, content: "Anderes Gerät", revision: 2 });
  expect(editor.getText()).toBe("Anderes Gerät");
});
