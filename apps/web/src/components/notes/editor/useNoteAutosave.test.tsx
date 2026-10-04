// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { Note } from "@wrapt/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { apiClient } from "../../../lib/apiClient";
import { useNoteAutosave } from "./useNoteAutosave";

const serverNote = { id: "notiz-a", revision: 2, content: "Serverfassung" } as Note;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("sperrt Autosave während eines Konflikts und speichert die eigene Fassung erst nach Auswahl", async () => {
  vi.useFakeTimers();
  let draft = "Erste Fassung";
  const save = vi.spyOn(apiClient, "saveNoteContent")
    .mockResolvedValueOnce({ status: "conflict", note: serverNote })
    .mockResolvedValueOnce({ status: "saved", note: { ...serverNote, revision: 3 } });
  const onSaved = vi.fn();
  const { result } = renderHook(() => useNoteAutosave({
    noteId: serverNote.id,
    revision: 1,
    getMarkdown: () => draft,
    onSaved,
  }));

  await act(async () => {
    result.current.schedule();
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(result.current.state).toBe("conflict");
  expect(result.current.conflictNote).toEqual(serverNote);

  draft = "Weiter bearbeitete Fassung";
  await act(async () => {
    result.current.schedule();
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(save).toHaveBeenCalledTimes(1);
  const unload = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);

  await act(async () => {
    result.current.resolveKeepMine();
    await vi.runAllTimersAsync();
  });
  expect(save).toHaveBeenLastCalledWith(serverNote.id, {
    content: "Weiter bearbeitete Fassung",
    expectedRevision: 2,
  });
  expect(result.current.state).toBe("saved");
  expect(onSaved).toHaveBeenCalledExactlyOnceWith({ ...serverNote, revision: 3 });
});

it("lädt die Serverrevision als neue Grundlage für spätere Änderungen", async () => {
  vi.useFakeTimers();
  const save = vi.spyOn(apiClient, "saveNoteContent")
    .mockResolvedValueOnce({ status: "conflict", note: serverNote })
    .mockResolvedValueOnce({ status: "saved", note: { ...serverNote, revision: 3 } });
  const { result } = renderHook(() => useNoteAutosave({
    noteId: serverNote.id,
    revision: 1,
    getMarkdown: () => "Änderung nach Serverfassung",
    onSaved: vi.fn(),
  }));

  await act(async () => {
    result.current.schedule();
    await vi.advanceTimersByTimeAsync(800);
  });
  act(() => result.current.acceptServerNote(serverNote));
  expect(result.current.state).toBe("saved");
  expect(result.current.conflictNote).toBeNull();

  await act(async () => {
    result.current.schedule();
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(save).toHaveBeenLastCalledWith(serverNote.id, {
    content: "Änderung nach Serverfassung",
    expectedRevision: 2,
  });
});

it("bewahrt Eingaben, die während eines laufenden Speicherns dazukommen", async () => {
  vi.useFakeTimers();
  type SaveResult = Awaited<ReturnType<typeof apiClient.saveNoteContent>>;
  let finishFirstSave!: (result: SaveResult) => void;
  const firstSave = new Promise<SaveResult>((resolve) => {
    finishFirstSave = resolve;
  });
  let draft = "Wort";
  const save = vi.spyOn(apiClient, "saveNoteContent")
    .mockReturnValueOnce(firstSave)
    .mockResolvedValueOnce({
      status: "saved",
      note: { ...serverNote, content: "Wort weiter", revision: 3 },
    });
  const { result } = renderHook(() => useNoteAutosave({
    noteId: serverNote.id,
    revision: 1,
    getMarkdown: () => draft,
    onSaved: vi.fn(),
  }));

  await act(async () => {
    result.current.schedule();
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(save).toHaveBeenCalledWith(serverNote.id, {
    content: "Wort",
    expectedRevision: 1,
  });

  draft = "Wort weiter";
  act(() => result.current.schedule());
  await act(async () => {
    finishFirstSave({
      status: "saved",
      note: { ...serverNote, content: "Wort", revision: 2 },
    });
    await firstSave;
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(result.current.state).toBe("dirty");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
  expect(save).toHaveBeenLastCalledWith(serverNote.id, {
    content: "Wort weiter",
    expectedRevision: 2,
  });
  expect(result.current.state).toBe("saved");
});
