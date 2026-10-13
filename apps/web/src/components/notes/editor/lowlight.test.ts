import { common, createLowlight } from "lowlight";
import { describe, expect, it } from "vitest";
import { loadNoteCodeLanguage, lowlight, noteCodeLanguages } from "./lowlight";

const original = createLowlight(common);
describe("Bedarfsgeladene Notizgrammatiken", () => {
  it("enthält vor Codebedarf nur Klartext und bietet weiterhin alle 37 Sprachen an", () => {
    expect(lowlight.listLanguages()).toEqual(["plaintext"]);
    expect(noteCodeLanguages).toEqual(original.listLanguages().sort());
  });
  it.each(Object.keys(common))("liefert für %s dieselben Highlight-Tokens", async (name) => {
    await loadNoteCodeLanguage(name);
    const content = 'const answer = 42;\n# Kommentar\nprint("Hallo")\n<div>Test</div>\nSELECT * FROM notes;';
    expect(lowlight.highlight(name, content)).toEqual(original.highlight(name, content));
  });
  it("dedupliziert Aliasreads und erhält unbekannte Sprachen mit automatischer Erkennung", async () => {
    await Promise.all([loadNoteCodeLanguage("tsx"), loadNoteCodeLanguage("typescript")]);
    expect(lowlight.registered("tsx")).toBe(true);
    await loadNoteCodeLanguage("unbekannt");
    expect(lowlight.highlightAuto("const answer = 42;")).toEqual(original.highlightAuto("const answer = 42;"));
  });
});
