import { describe, expect, it } from "vitest";
import { extensionOf, previewKindOf } from "./fileManager";

function entry(name: string) {
  return { name };
}

describe("Dateivorschau-Erkennung", () => {
  it("zeigt HTML als Quelltext und nicht als eingebettete Website", () => {
    expect(previewKindOf(entry("index.html"))).toBe("code");
    expect(previewKindOf(entry("layout.HTM"))).toBe("code");
  });

  it("erkennt gängige Code-, Text-, Medien- und Dokumentformate", () => {
    const cases = {
      "app.tsx": "code",
      "config.json": "code",
      "styles.scss": "code",
      "README.md": "markdown",
      ".env.local": "code",
      "logo.webp": "image",
      "recording.webm": "video",
      "sound.flac": "audio",
      "manual.pdf": "pdf",
      "archive.zip": "fallback",
    } as const;

    for (const [name, kind] of Object.entries(cases)) {
      expect(previewKindOf(entry(name)), name).toBe(kind);
    }
  });

  it("behandelt Punktdateien wie normale Dateiendungen", () => {
    expect(extensionOf(".gitignore")).toBe("gitignore");
    expect(extensionOf(".env")).toBe("env");
    expect(extensionOf("Makefile")).toBe("");
  });
});
