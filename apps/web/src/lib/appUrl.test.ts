import { describe, expect, it } from "vitest";
import { appBase, codeEditorUrl } from "./appUrl";

describe("appUrl", () => {
  it("meldet den Basename der App", () => {
    expect(appBase()).toBe("/wrapt");
  });

  it("baut die Code-Editor-Seite mit Ordner inklusive Basename", () => {
    expect(codeEditorUrl("/home/user/projects/foo")).toBe("/wrapt/code-editor/?folder=%2Fhome%2Fuser%2Fprojects%2Ffoo");
  });

  it("baut die Code-Editor-Seite ohne Ordner ohne hängendes Fragezeichen", () => {
    expect(codeEditorUrl(null)).toBe("/wrapt/code-editor/");
  });
});
