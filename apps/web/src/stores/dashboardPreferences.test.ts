import { describe, expect, it } from "vitest";
import { defaultDashboardArtworkId, getDashboardArtwork } from "../lib/dashboardArtwork";
import { migrateDashboardPreferences } from "./dashboardPreferences";

describe("Dashboard-Präferenzen", () => {
  it("übernimmt ausgeblendete Bereiche und ergänzt Artwork standardmäßig ausgeschaltet", () => {
    expect(migrateDashboardPreferences({
      hiddenSections: ["metrics", "unbekannt"],
      artworkEnabled: true,
      artworkId: "hero-orbit",
    })).toEqual({
      hiddenSections: ["metrics"],
      artworkEnabled: false,
      artworkId: defaultDashboardArtworkId,
    });
  });

  it("verwendet bei einer unbekannten Motiv-ID das Doku-Startmotiv", () => {
    expect(getDashboardArtwork("unbekannt").id).toBe(defaultDashboardArtworkId);
  });
});
