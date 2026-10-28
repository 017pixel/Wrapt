// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { readNoteDraft, removeNoteDraft, writeNoteDraft } from "./noteDrafts";
afterEach(() => localStorage.clear());
it("sichert Inhalt und Ausgangsrevision für Wiederherstellung und Konflikterkennung", () => {
  expect(writeNoteDraft("page", 3, "Noch nicht gespeichert")).toBe(true);
  expect(readNoteDraft("page")).toMatchObject({ version: 1, revision: 3, content: "Noch nicht gespeichert" });
  removeNoteDraft("page");
  expect(readNoteDraft("page")).toBeNull();
});
it("liefert bei vollem Speicher keine falsche Speicherbestätigung", () => {
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error("QuotaExceeded"); };
  try { expect(writeNoteDraft("page", 1, "Text")).toBe(false); }
  finally { localStorage.setItem = original; }
});
it("trennt kopierte Tab-Sitzungen und bewahrt deren Wiederherstellung", async () => {
  const { vi } = await import("vitest");
  vi.resetModules();
  const first = await import("./noteDrafts");
  expect(first.writeNoteDraft("shared", 2, "Erster Tab")).toBe(true);
  vi.resetModules();
  const duplicate = await import("./noteDrafts");
  expect(duplicate.readNoteDraft("shared")?.content).toBe("Erster Tab");
  expect(duplicate.writeNoteDraft("shared", 2, "Duplizierter Tab")).toBe(true);
  expect(first.readNoteDraft("shared")?.content).toBe("Erster Tab");
  first.removeNoteDraft("shared");
  expect(duplicate.readNoteDraft("shared")?.content).toBe("Duplizierter Tab");
  vi.resetModules();
  const reloaded = await import("./noteDrafts");
  expect(reloaded.readNoteDraft("shared")?.content).toBe("Duplizierter Tab");
});
