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

  it("ordnet Layout und verbundene Workspaces getrennt zu", () => {
    expect(searchSettings("Layout")[0]?.entry.id).toBe("layout");
    expect(searchSettings("Workspace")[0]?.entry.id).toBe("workspaces");
    expect(searchSettings("Verbindung")[0]?.entry.id).toBe("workspaces");
  });

  it("führt Glas und Transparenz zum Regler im Design-Tab", () => {
    for (const query of ["Transparenz", "Glas", "Deckkraft", "Dropdown"]) {
      expect(searchSettings(query)[0]?.entry).toMatchObject({
        id: "design-transparency", tab: "design", anchor: "settings-design-transparency",
      });
    }
  });

  it("findet einen Bereich trotz bis zu drei Tippfehlern", () => {
    expect(searchSettings("desgin").some((result) => result.entry.id === "design")).toBe(true);
    expect(searchSettings("neustar").some((result) => result.entry.id === "general-restart")).toBe(true);
    expect(searchSettings("systm").some((result) => result.entry.id === "system")).toBe(true);
  });

  it("findet Hermes V2 unter Experimente", () => {
    expect(searchSettings("Hermes V2")[0]?.entry).toMatchObject({
      id: "hermes-v2",
      tab: "experimente",
      anchor: "settings-hermes-v2",
    });
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
