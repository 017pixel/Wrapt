import { expect, it } from "vitest";
import { normalizeLegacyPluginDraft } from "./legacy-draft.js";

it("entfernt nur zurückgezogene Plugin-Flächen aus der Lesefassung und erhält die Quelldaten", () => {
  const draft = {
    name: "Mein Plugin",
    orbit: { enabled: true },
    surfaces: ["page", "orbit", "dashboard"],
    surfaceContributions: [{ surface: "orbit", id: "alt" }, { surface: "dashboard", id: "karte" }],
    wizard: { goal: "Mein Ziel", includeOrbit: true, surfaces: ["page", "orbit"] },
  };
  const before = structuredClone(draft);
  expect(normalizeLegacyPluginDraft(draft)).toEqual({
    name: "Mein Plugin",
    surfaces: ["page", "dashboard"],
    surfaceContributions: [{ surface: "dashboard", id: "karte" }],
    wizard: { goal: "Mein Ziel", surfaces: ["page"] },
  });
  expect(draft).toEqual(before);
});
