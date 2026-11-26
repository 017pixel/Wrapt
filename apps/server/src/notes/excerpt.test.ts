import { expect, it } from "vitest";
import { createNoteExcerpt, NOTE_EXCERPT_SCAN_BYTES } from "./excerpt.js";

it("liest für große Notizen nur das Präfix und liefert dieselbe Vorschau", () => {
  const content = "Wort ".repeat(200_000);
  expect(createNoteExcerpt(content)).toBe("Wort ".repeat(200_000).slice(0, 200));
  expect(createNoteExcerpt(content)).toHaveLength(200);
});

it("fällt bei einem langen führenden Codeblock auf den Vollscan zurück", () => {
  const content = `\`\`\`\n${"x".repeat(NOTE_EXCERPT_SCAN_BYTES + 1_000)}\n\`\`\`\n\nSichtbarer Text danach`;
  expect(createNoteExcerpt(content)).toBe("Sichtbarer Text danach");
});

it("findet einen Treffer auch außerhalb des Präfixes", () => {
  const content = `${"A ".repeat(10_000)}Zielwort am Ende`;
  const excerpt = createNoteExcerpt(content, "Zielwort");
  expect(excerpt).toContain("Zielwort");
});
