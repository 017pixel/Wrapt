import { describe, expect, it } from "vitest";
import { orbitTodoMarkdown } from "./orbitTodoMarkdown.js";

describe("Orbit-To-dos als Notes-Task-Blöcke", () => {
  it("erhält Text, Status und Aufgabenreihenfolge", () => {
    const content = JSON.stringify({
      version: 1,
      items: [
        { id: "a", text: "Erste Aufgabe", done: true },
        { id: "b", text: "Zweite Aufgabe", done: false },
      ],
    });

    expect(orbitTodoMarkdown(content)).toBe([
      "- [x] Erste Aufgabe",
      "  - ID: a",
      "- [ ] Zweite Aufgabe",
      "  - ID: b",
    ].join("\n"));
  });

  it("übernimmt Fälligkeit und unterstützte Zusatzfelder als Task-Metadaten", () => {
    const content = JSON.stringify({
      version: 1,
      items: [{ id: "a", text: "Abgeben", done: false, dueDate: "2026-09-30", priority: "hoch" }],
    });

    expect(orbitTodoMarkdown(content)).toBe([
      "- [ ] Abgeben",
      "  - ID: a",
      "  - Fällig am: 2026-09-30",
      "  - Priorität: hoch",
    ].join("\n"));
  });

  it("behält kompatible Markdown-Checklisten und überführt einfache Altzeilen", () => {
    expect(orbitTodoMarkdown("- [x] Erledigt\n- [ ] Offen")).toBe("- [x] Erledigt\n- [ ] Offen");
    expect(orbitTodoMarkdown("- Milch\nBrot")).toBe("- [ ] Milch\n- [ ] Brot");
    expect(orbitTodoMarkdown("")).toBe("");
  });
});
