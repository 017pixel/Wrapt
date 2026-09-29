import { describe, expect, it } from "vitest";
import {
  createNoteRequestSchema,
  noteSchema,
  noteSearchQuerySchema,
  notesListResponseSchema,
  saveNoteContentRequestSchema,
  updateNoteRequestSchema,
} from "./notes.js";

function validNote() {
  return {
    id: "3f0b6f5e-1f9d-4f0b-9a3c-2b8b8f0d5a11",
    title: "Neue Notiz",
    content: "# Überschrift\n\nText",
    revision: 1,
    createdAt: "2026-09-23T10:00:00.000Z",
    updatedAt: "2026-09-23T10:00:00.000Z",
  };
}

describe("notes-vertraege", () => {
  it("setzt Standardwerte für optionale Notizfelder", () => {
    const parsed = noteSchema.parse(validNote());
    expect(parsed.icon).toBeNull();
    expect(parsed.parentId).toBeNull();
    expect(parsed.favorite).toBe(false);
    expect(parsed.archived).toBe(false);
    expect(parsed.coverAssetId).toBeNull();
    expect(parsed.sortOrder).toBe(0);
  });

  it("weist leere Titel zurück und trimmt gültige Titel", () => {
    expect(() => noteSchema.parse({ ...validNote(), title: "   " })).toThrow();
    const parsed = noteSchema.parse({ ...validNote(), title: "  Einkaufsliste  " });
    expect(parsed.title).toBe("Einkaufsliste");
  });

  it("validiert die Listenantwort mit Excerpt", () => {
    const parsed = notesListResponseSchema.parse({
      notes: [
        {
          id: "3f0b6f5e-1f9d-4f0b-9a3c-2b8b8f0d5a11",
          title: "Notiz",
          excerpt: "Erste Zeile",
          createdAt: "2026-09-01T10:00:00.000Z",
          updatedAt: "2026-09-23T10:00:00.000Z",
        },
      ],
    });
    expect(parsed.notes[0]?.favorite).toBe(false);
    expect(parsed.notes[0]?.parentId).toBeNull();
    expect(parsed.notes[0]?.createdAt).toBe("2026-09-01T10:00:00.000Z");
  });

  it("wertet die Suchparameter aus", () => {
    const parsed = noteSearchQuerySchema.parse({ q: "plan", titleOnly: "1" });
    expect(parsed.titleOnly).toBe(true);
    expect(parsed.createdWithin).toBe("any");
    expect(parsed.updatedWithin).toBe("any");
    const scoped = noteSearchQuerySchema.parse({
      q: "plan",
      scopeId: "3f0b6f5e-1f9d-4f0b-9a3c-2b8b8f0d5a11",
      updatedWithin: "week",
    });
    expect(scoped.scopeId).toBe("3f0b6f5e-1f9d-4f0b-9a3c-2b8b8f0d5a11");
    expect(scoped.updatedWithin).toBe("week");
    expect(noteSearchQuerySchema.parse({ q: "plan", titleOnly: "0" }).titleOnly).toBe(false);
  });

  it("verlangt beim Erstellen höchstens Titel und Elternnotiz", () => {
    const parsed = createNoteRequestSchema.parse({});
    expect(parsed.title).toBe("Unbenannte Notiz");
    expect(parsed.parentId).toBeNull();
    expect(() => createNoteRequestSchema.parse({ title: "" })).toThrow();
  });

  it("verlangt bei Aktualisierungen mindestens ein Feld", () => {
    expect(() => updateNoteRequestSchema.parse({})).toThrow();
    const parsed = updateNoteRequestSchema.parse({ favorite: true });
    expect(parsed.favorite).toBe(true);
  });

  it("verlangt beim Speichern von Inhalt eine Revision", () => {
    expect(() => saveNoteContentRequestSchema.parse({ content: "Text" })).toThrow();
    const parsed = saveNoteContentRequestSchema.parse({ content: "Text", expectedRevision: 2 });
    expect(parsed.expectedRevision).toBe(2);
  });
});
