import { describe, expect, it } from "vitest";
import {
  levenshteinDistanceWithin,
  normalizeSettingsSearchText,
  searchSettings,
} from "./settingsSearch";

describe("settingsSearch", () => {
  it("normalisiert deutsche Schreibweisen und Umlaute", () => {
    expect(normalizeSettingsSearchText("  Aussehen, Farben  ")).toBe("aussehen farben");
    expect(normalizeSettingsSearchText("Maße und Größe")).toBe("masse und grosse");
  });

  it("findet Design über direkte Aliase", () => {
    expect(searchSettings("Aussehen")[0]?.entry.id).toBe("design");
    expect(searchSettings("Farben ändern")[0]?.entry.id).toBe("design-colors");
  });

  it("findet einen Bereich trotz bis zu drei Tippfehlern", () => {
    expect(searchSettings("desgin").some((result) => result.entry.id === "design")).toBe(true);
    expect(searchSettings("neustar").some((result) => result.entry.id === "general-restart")).toBe(true);
    expect(searchSettings("systm").some((result) => result.entry.id === "system")).toBe(true);
  });

  it("verwirft deutlich weiter entfernte Eingaben", () => {
    expect(levenshteinDistanceWithin("design", "design")).toBe(0);
    expect(levenshteinDistanceWithin("design", "dxxixn")).toBe(3);
    expect(searchSettings("dxxxxxx")).toEqual([]);
  });

  it("liefert für leere Eingaben keine Treffer", () => {
    expect(searchSettings("   ")).toEqual([]);
  });
});
