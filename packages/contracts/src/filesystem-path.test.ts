import { describe, expect, it } from "vitest";
import { absoluteFilesystemPathSchema, terminalCwdFromOsc } from "./filesystem-path.js";
import { terminalEntrySchema, terminalEntryPatchSchema, terminalTabSchema } from "./index.js";

describe("Terminalpfade aller Serverplattformen", () => {
  it.each(["/home/test/Projekt", "/Users/test/Projekt", "C:\\Users\\test\\Projekt", "D:/Arbeit/Projekt", "\\\\server\\share\\Projekt"])("erhält den absoluten Pfad %s", (path) => {
    expect(absoluteFilesystemPathSchema.parse(path)).toBe(path);
    expect(terminalTabSchema.parse({ id: "00000000-0000-4000-8000-000000000001", projectId: null, kind: "shell", initialCwd: path }).initialCwd).toBe(path);
    expect(terminalEntrySchema.parse({ id: "entry", runtimeId: null, name: "Terminal", parentFolderId: null, sortOrder: 0, pinned: false, persistent: true, kind: "shell", projectId: null, initialCwd: path }).initialCwd).toBe(path);
    expect(terminalEntryPatchSchema.parse({ initialCwd: path }).initialCwd).toBe(path);
  });
  it.each(["relativ", "C:relativ", "\\relativ", "–", "C:\\mit\0Nullbyte"])("verwirft %s", (path) => {
    expect(absoluteFilesystemPathSchema.safeParse(path).success).toBe(false);
  });
  it("liest OSC 7 und OSC 9;9 ohne das Serverformat durch den Browser zu verändern", () => {
    expect(terminalCwdFromOsc(7, "file://linux-host/home/test/mit%20Leerzeichen")).toBe("/home/test/mit Leerzeichen");
    expect(terminalCwdFromOsc(7, "file:///C:/Users/test/Projekt")).toBe("C:/Users/test/Projekt");
    expect(terminalCwdFromOsc(9, '9;"C:\\Users\\test\\Projekt"')).toBe("C:\\Users\\test\\Projekt");
    expect(terminalCwdFromOsc(9, '9;"\\\\server\\share\\Projekt"')).toBe("\\\\server\\share\\Projekt");
    expect(terminalCwdFromOsc(9, "4;1;75")).toBeNull();
    expect(terminalCwdFromOsc(7, "https://example.com/foo")).toBeNull();
    expect(terminalCwdFromOsc(7, "file:///home/%ungültig")).toBeNull();
  });
});
