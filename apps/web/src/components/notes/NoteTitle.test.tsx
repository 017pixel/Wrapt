// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Note } from "@wrapt/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { NoteTitle } from "./NoteTitle";

afterEach(cleanup);

const note = { id: "seite-a", title: "Alter Titel", icon: null } as Note;

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
