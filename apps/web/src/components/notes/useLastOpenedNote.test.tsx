// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { NoteSummary } from "@wrapt/contracts";
import { useNotesPreferences } from "../../stores/notesPreferences";
import { useLastOpenedNote } from "./useLastOpenedNote";

function note(id: string, overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id,
    title: id,
    parentId: null,
    sortOrder: 0,
    favorite: false,
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides,
  } as NoteSummary;
}

beforeEach(() => {
  useNotesPreferences.setState({ lastOpenedNoteId: null });
  localStorage.clear();
});

it("stellt die gespeicherte Seite wieder her statt der obersten", async () => {
  useNotesPreferences.setState({ lastOpenedNoteId: "unten" });
  const onSelectNote = vi.fn();
  renderHook(() =>
    useLastOpenedNote({ noteId: null, notes: [note("oben"), note("unten")], windowMode: false, onSelectNote }),
  );
  await waitFor(() => expect(onSelectNote).toHaveBeenCalledWith("unten"));
});

it("fällt auf die oberste Seite zurück, wenn nichts gespeichert ist", async () => {
  const onSelectNote = vi.fn();
  renderHook(() =>
    useLastOpenedNote({ noteId: null, notes: [note("oben"), note("unten")], windowMode: false, onSelectNote }),
  );
  await waitFor(() => expect(onSelectNote).toHaveBeenCalledWith("oben"));
});

it("überspringt archivierte gespeicherte Seiten", async () => {
  useNotesPreferences.setState({ lastOpenedNoteId: "alt" });
  const onSelectNote = vi.fn();
  renderHook(() =>
    useLastOpenedNote({
      noteId: null,
      notes: [note("oben"), note("alt", { archived: true })],
      windowMode: false,
      onSelectNote,
    }),
  );
  await waitFor(() => expect(onSelectNote).toHaveBeenCalledWith("oben"));
});

it("merkt sich die geöffnete Seite für den nächsten Start", async () => {
  const onSelectNote = vi.fn();
  renderHook(() =>
    useLastOpenedNote({ noteId: "unten", notes: [note("oben"), note("unten")], windowMode: false, onSelectNote }),
  );
  await waitFor(() => expect(useNotesPreferences.getState().lastOpenedNoteId).toBe("unten"));
  expect(onSelectNote).not.toHaveBeenCalled();
});

it("stellt im Fenstermodus nichts wieder her", () => {
  useNotesPreferences.setState({ lastOpenedNoteId: "unten" });
  const onSelectNote = vi.fn();
  renderHook(() =>
    useLastOpenedNote({ noteId: null, notes: [note("oben"), note("unten")], windowMode: true, onSelectNote }),
  );
  expect(onSelectNote).not.toHaveBeenCalled();
});
