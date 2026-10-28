// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fitNoteWindow, useQuickNote } from "./quickNoteState";

describe("Quick-Note-Fenster", () => {
  it("holt denselben Entwurf wieder nach vorne", () => {
    const state = useQuickNote.getState();
    state.setNoteId("draft"); state.show(); state.close(); state.show();
    expect(useQuickNote.getState()).toMatchObject({ open: true, noteId: "draft" });
  });
  it("holt Position und Größe nach einem Bildschirmwechsel zurück ins Bild", () => {
    expect(fitNoteWindow({ x: 1200, y: 800, width: 600, height: 500 }, { width: 390, height: 600 })).toEqual({ x: 8, y: 92, width: 374, height: 500 });
    expect(fitNoteWindow({ x: -300, y: -30, width: 100, height: 50 }, { width: 1000, height: 700 })).toEqual({ x: 8, y: 8, width: 280, height: 240 });
  });
});
