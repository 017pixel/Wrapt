import { common, createLowlight } from "lowlight";
import { expect, it } from "vitest";
import { loadNoteCodeLanguage, lowlight } from "./lowlight";

it("erhält automatische Highlight-Ties auch nach anderer Sprachimportreihenfolge", async () => {
  const original = createLowlight(common);
  await loadNoteCodeLanguage("python");
  await loadNoteCodeLanguage("unbekannt");
  for (const content of ["int main() { return 0; }", "# comment\n", "const x = 1;", "{\"answer\":42}"]) {
    expect(lowlight.highlightAuto(content)).toEqual(original.highlightAuto(content));
  }
});
