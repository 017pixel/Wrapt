// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { moveBefore, useNotesPreferences } from "./notesPreferences.js";

afterEach(() => { localStorage.clear(); useNotesPreferences.setState(useNotesPreferences.getInitialState()); });
it("migriert die eingeklappte Privatgruppe und erhält Breite, Baum und letzte Seite", async () => {
  localStorage.setItem("wrapt.notes-preferences.v1", JSON.stringify({ version: 1, state: {
    sidebarWidth: 310, expanded: { page: true }, collapsedSections: { private: true }, lastOpenedNoteId: "page",
  } }));
  await useNotesPreferences.persist.rehydrate();
  expect(useNotesPreferences.getState()).toMatchObject({ sidebarWidth: 310, expanded: { page: true },
    collapsedSections: { all: true }, lastOpenedNoteId: "page", sectionOrder: ["recent", "favorites", "all", "trash"] });
  expect(JSON.parse(localStorage.getItem("wrapt.notes-preferences.v1")!).version).toBe(2);
});
it("sortiert neue Abschnitte und Favoriten ohne doppelte IDs", () => {
  expect(moveBefore(["a", "b", "a"], "c", "b")).toEqual(["a", "c", "b"]);
  useNotesPreferences.getState().moveSection("favorites", "folder:1", ["recent", "favorites", "all", "folder:1"]);
  expect(useNotesPreferences.getState().sectionOrder.indexOf("favorites")).toBeLessThan(useNotesPreferences.getState().sectionOrder.indexOf("folder:1"));
  useNotesPreferences.getState().moveFavorite("b", "a", ["a", "b", "c"]);
  expect(useNotesPreferences.getState().favoriteOrder).toEqual(["b", "a", "c"]);
});
