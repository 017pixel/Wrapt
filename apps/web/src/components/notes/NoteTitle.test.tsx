// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Note } from "@wrapt/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { NoteTitle } from "./NoteTitle";

afterEach(() => { cleanup(); vi.useRealTimers(); });

const note = { id: "seite-a", title: "Alter Titel", icon: null } as Note;

it("lässt eine ältere Titelbestätigung keine neuere Eingabe überschreiben", () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const view = render(<NoteTitle note={note} onPatch={save} />);
  const input = screen.getByRole("textbox", { name: "Notiztitel" });
  fireEvent.change(input, { target: { value: "Erste Fassung" } });
  act(() => vi.advanceTimersByTime(500));
  fireEvent.change(input, { target: { value: "Zweite Fassung" } });
  act(() => vi.advanceTimersByTime(500));
  view.rerender(<NoteTitle note={{ ...note, title: "Erste Fassung" }} onPatch={save} />);
  expect((input as HTMLTextAreaElement).value).toBe("Zweite Fassung");
  view.rerender(<NoteTitle note={{ ...note, title: "Zweite Fassung" }} onPatch={save} />);
  expect((input as HTMLTextAreaElement).value).toBe("Zweite Fassung");
});

it("speichert einen noch nicht entprellten Titel beim Seitenwechsel", () => {
  const save = vi.fn();
  const view = render(<NoteTitle note={note} onPatch={save} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Notiztitel" }), { target: { value: "Neuer Titel" } });

  view.rerender(<NoteTitle note={{ ...note, id: "seite-b", title: "Andere Seite" }} onPatch={save} />);

  expect(save).toHaveBeenCalledExactlyOnceWith({ title: "Neuer Titel" });
  expect((screen.getByRole("textbox", { name: "Notiztitel" }) as HTMLTextAreaElement).value).toBe("Andere Seite");
});

it("speichert einen offenen Titel beim Schließen der Notizfläche", () => {
  const save = vi.fn();
  const view = render(<NoteTitle note={note} onPatch={save} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Notiztitel" }), { target: { value: "  Entwurf  " } });
  view.unmount();

  expect(save).toHaveBeenCalledExactlyOnceWith({ title: "Entwurf" });
});

it("speichert eingefügte mehrzeilige Titel weiterhin als eine Zeile", () => {
  const save = vi.fn();
  render(<NoteTitle note={note} onPatch={save} />);
  const title = screen.getByRole("textbox", { name: "Notiztitel" });
  fireEvent.change(title, { target: { value: "Release\nvorbereiten" } });
  fireEvent.blur(title);

  expect(save).toHaveBeenCalledExactlyOnceWith({ title: "Release vorbereiten" });
});

it("beendet die Titelbearbeitung mit Enter und speichert", () => {
  const save = vi.fn();
  render(<NoteTitle note={note} onPatch={save} />);
  const title = screen.getByRole("textbox", { name: "Notiztitel" });
  title.focus();
  fireEvent.change(title, { target: { value: "Neuer Titel" } });
  fireEvent.keyDown(title, { key: "Enter" });

  expect(save).toHaveBeenCalledExactlyOnceWith({ title: "Neuer Titel" });
  expect(document.activeElement).not.toBe(title);
});

it("speichert die Rückkehr zum ursprünglichen Titel während einer offenen Bestätigung", () => {
  vi.useFakeTimers();
  const save = vi.fn();
  render(<NoteTitle note={note} onPatch={save} />);
  const input = screen.getByRole("textbox", { name: "Notiztitel" });
  fireEvent.change(input, { target: { value: "Zwischenstand" } });
  act(() => vi.advanceTimersByTime(500));
  fireEvent.change(input, { target: { value: note.title } });
  act(() => vi.advanceTimersByTime(500));
  expect(save.mock.calls).toEqual([[{ title: "Zwischenstand" }], [{ title: note.title }]]);
});
