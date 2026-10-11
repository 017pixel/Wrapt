// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { stripFrontmatter } from "./MarkdownEditor";

describe("stripFrontmatter", () => {
  it("entfernt den Frontmatter-Kopf für die Vorschau", () => {
    expect(stripFrontmatter("---\nname: demo\ndescription: x\n---\n\n# Titel\n")).toBe("# Titel\n");
  });

  it("lässt Inhalte ohne Kopf unverändert", () => {
    expect(stripFrontmatter("# Titel\nText\n")).toBe("# Titel\nText\n");
    expect(stripFrontmatter("--- kein Kopf\nText\n")).toBe("--- kein Kopf\nText\n");
  });
});
