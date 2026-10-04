// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Note } from "@wrapt/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { NoteEditor } from "./NoteEditor";

const autosave = vi.hoisted(() => ({
  acceptServerNote: vi.fn(),
  getDraftContent: vi.fn(() => null),
  resolveKeepMine: vi.fn(),
}));

vi.mock("./editor/useNoteAutosave.js", () => ({
  useNoteAutosave: () => ({
    state: "conflict",
    conflictNote: { id: "notiz-a", revision: 2, content: "Serverfassung" },
    schedule: vi.fn(),
    flush: vi.fn(),
    saveNow: vi.fn(),
    acceptServerNote: autosave.acceptServerNote,
    getDraftContent: autosave.getDraftContent,
    resolveKeepMine: autosave.resolveKeepMine,
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("zeigt den Revisionskonflikt auch im kompakten Orbit-Editor mit beiden Auflösungen", () => {
  const note = { id: "notiz-a", revision: 1, content: "Eigene Fassung", title: "Notiz" } as Note;
  const onSaved = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NoteEditor note={note} compact onSaved={onSaved} />
    </QueryClientProvider>,
  );

  expect(screen.getByRole("alert").textContent).toContain("Diese Notiz wurde woanders geändert.");
  fireEvent.click(screen.getByRole("button", { name: "Meine Fassung behalten" }));
  expect(autosave.resolveKeepMine).toHaveBeenCalledOnce();

  fireEvent.click(screen.getByRole("button", { name: "Serverfassung laden" }));
  expect(autosave.acceptServerNote).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
  expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }));
});
