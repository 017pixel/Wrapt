import { describe, expect, it } from "vitest";
import type { NoteSummary } from "@wrapt/contracts";
import { groupNotesByDate } from "./notesDateGroups.js";
import { buildNotePathMap } from "./notesPaths.js";
import { defaultPaletteFilters, noteMatchesFilters } from "./paletteFilters.js";

function summary(id: string, overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id,
    title: id,
    icon: null,
    parentId: null,
    sortOrder: 0,
    favorite: false,
    archived: false,
    excerpt: "",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-23T10:00:00.000Z",
    ...overrides,
  };
}

const now = new Date("2026-09-23T15:00:00.000Z");

describe("groupNotesByDate", () => {
  it("gruppiert nach Heute, Gestern, Vergangene Woche und Älter", () => {
    const groups = groupNotesByDate(
      [
        summary("heute", { updatedAt: "2026-09-23T09:00:00.000Z" }),
        summary("gestern", { updatedAt: "2026-09-22T09:00:00.000Z" }),
        summary("woche", { updatedAt: "2026-09-18T09:00:00.000Z" }),
        summary("alt", { updatedAt: "2026-08-01T09:00:00.000Z" }),
      ],
      now,
    );
    expect(groups.map((group) => group.label)).toEqual([
      "Heute",
      "Gestern",
      "Vergangene Woche",
      "Älter",
    ]);
    expect(groups[0]?.notes.map((note) => note.id)).toEqual(["heute"]);
  });

  it("lässt leere Gruppen weg und sortiert innerhalb der Gruppe", () => {
    const groups = groupNotesByDate(
      [
        summary("früh", { updatedAt: "2026-09-23T08:00:00.000Z" }),
        summary("spät", { updatedAt: "2026-09-23T12:00:00.000Z" }),
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.notes.map((note) => note.id)).toEqual(["spät", "früh"]);
  });
});

describe("buildNotePathMap", () => {
  it("liefert die Elternkette ohne die Seite selbst", () => {
    const paths = buildNotePathMap([
      summary("wurzel", { title: "Wurzel" }),
      summary("mitte", { title: "Mitte", parentId: "wurzel" }),
      summary("blatt", { title: "Blatt", parentId: "mitte" }),
    ]);
    expect(paths.get("blatt")).toBe("Wurzel / Mitte");
    expect(paths.get("wurzel")).toBe("");
  });

  it("bleibt bei Kreisen stabil", () => {
    const paths = buildNotePathMap([
      summary("a", { title: "A", parentId: "b" }),
      summary("b", { title: "B", parentId: "a" }),
    ]);
    expect(paths.get("a")).toBe("B");
    expect(paths.get("b")).toBe("A");
  });
});

describe("noteMatchesFilters", () => {
  const notes = [
    summary("eltern", { createdAt: "2026-09-20T10:00:00.000Z" }),
    summary("kind", { parentId: "eltern", createdAt: "2026-09-20T10:00:00.000Z" }),
    summary("alt", { createdAt: "2026-01-01T10:00:00.000Z", updatedAt: "2026-01-02T10:00:00.000Z" }),
    summary("archiviert", { archived: true }),
  ];

  it("filtert nach Bereich samt Unterseiten", () => {
    const filters = { ...defaultPaletteFilters, scopeId: "eltern" };
    const ids = notes.filter((note) => noteMatchesFilters(note, filters, notes, now)).map((note) => note.id);
    expect(ids).toEqual(["eltern", "kind"]);
  });

  it("filtert nach Erstell- und Änderungszeitraum", () => {
    const created = { ...defaultPaletteFilters, createdWithin: "week" as const };
    expect(notes.filter((note) => noteMatchesFilters(note, created, notes, now)).map((n) => n.id)).toEqual([
      "eltern",
      "kind",
    ]);
    const updated = { ...defaultPaletteFilters, updatedWithin: "month" as const };
    expect(notes.filter((note) => noteMatchesFilters(note, updated, notes, now)).map((n) => n.id)).toEqual([
      "eltern",
      "kind",
    ]);
  });

  it("blendet archivierte Seiten immer aus", () => {
    expect(noteMatchesFilters(notes[3]!, defaultPaletteFilters, notes, now)).toBe(false);
  });
});
