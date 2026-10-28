import { describe, expect, it } from "vitest";
import { rankNoteMatches } from "./fuzzySearch.js";

describe("fehlertolerante Notizsuche", () => {
  it("findet Tippfehler, vertauschte Buchstaben und Umlaute", () => {
    const notes = [{ title: "Notizen" }, { title: "Überlegungen" }, { title: "Preview" }];
    expect(rankNoteMatches(notes, "notitzen", true)[0]?.title).toBe("Notizen");
    expect(rankNoteMatches(notes, "preveiw", true)[0]?.title).toBe("Preview");
    expect(rankNoteMatches(notes, "uberlegungen", true)[0]?.title).toBe("Überlegungen");
  });
  it("gewichtet exakte Titel vor ähnlichen Titeln und Inhalt", () => {
    const notes = [{ title: "Andere", content: "Notizen" }, { title: "Notizzen" }, { title: "Notizen" }];
    expect(rankNoteMatches(notes, "Notizen", false).map((n) => n.title)).toEqual(["Notizen", "Notizzen", "Andere"]);
    expect(rankNoteMatches(notes, "Notizen", true).map((n) => n.title)).toEqual(["Notizen", "Notizzen"]);
  });
  it("macht kurze oder leere Eingaben nicht zu beliebigen Treffern", () => {
    expect(rankNoteMatches([{ title: "API" }], "ap", true)).toHaveLength(1);
    expect(rankNoteMatches([{ title: "API" }], "ax", true)).toHaveLength(0);
    expect(rankNoteMatches([{ title: "API" }], " ", false)).toHaveLength(0);
  });
});
