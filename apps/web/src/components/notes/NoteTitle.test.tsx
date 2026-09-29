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
  expect((screen.getByRole("textbox", { name: "Notiztitel" }) as HTMLInputElement).value).toBe("Andere Seite");
});

it("speichert einen offenen Titel beim Schließen der Notizfläche", () => {
  const save = vi.fn();
  const view = render(<NoteTitle note={note} onPatch={save} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Notiztitel" }), { target: { value: "  Entwurf  " } });
  view.unmount();

  expect(save).toHaveBeenCalledExactlyOnceWith({ title: "Entwurf" });
});
