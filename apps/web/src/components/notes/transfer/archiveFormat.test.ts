import { expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { portableNoteMarkdown, readArchive, replaceMediaReference, resolveArchivePath } from "./archiveFormat";
it("exportiert interne Verweise als normale Markdown-Links", () => {
  expect(portableNoteMarkdown('Siehe [noteMention noteId="id" label="API"]', new Map([["id", "id.md"]]))).toBe("Siehe [API](id.md)");
});
it("liest Markdown-ZIPs und weist unsichere Pfade ab", () => {
  expect(Object.keys(readArchive(zipSync({ "Idee.md": strToU8("# Idee") })).files)).toEqual(["Idee.md"]);
  expect(() => readArchive(zipSync({ "../Idee.md": strToU8("Text") }))).toThrow("ungültige");
});
it("erhält relative Verknüpfungen mit URL-kodierten Dateinamen", () => {
  expect(resolveArchivePath("Projekt/Notiz.md", "../Ideen/Neue%20Idee.md#Titel")).toBe("Ideen/Neue Idee.md");
  expect(resolveArchivePath("Notiz.md", "../Außerhalb.md")).toBeNull();
  expect(resolveArchivePath("Notiz.md", "https://example.com/file.md")).toBeNull();
});

it("löst absolute und relative Medienverweise vom alten Server", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  expect(replaceMediaReference(`[Datei](https://old.invalid/api/v1/media/${id})`, id, "assets/datei")).toBe("[Datei](assets/datei)");
  expect(replaceMediaReference(`[Datei](/api/v1/media/${id})`, id, "/api/v1/media/neu")).toBe("[Datei](/api/v1/media/neu)");
});
