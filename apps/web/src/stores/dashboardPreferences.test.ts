import { beforeEach, describe, expect, it } from "vitest";
import { defaultDashboardArtworkId, getDashboardArtwork } from "../lib/dashboardArtwork";
import {
  allDashboardSections,
  defaultDashboardSectionOrder,
  migrateDashboardPreferences,
  useDashboardPreferences,
} from "./dashboardPreferences";

beforeEach(() => {
  useDashboardPreferences.setState({
    hiddenSections: new Set(),
    sectionOrder: [...defaultDashboardSectionOrder],
  });
});

describe("Dashboard-Präferenzen", () => {
  it("übernimmt ausgeblendete Bereiche und ergänzt Artwork standardmäßig ausgeschaltet", () => {
    expect(migrateDashboardPreferences({
      hiddenSections: ["metrics", "unbekannt"],
      artworkEnabled: true,
      artworkId: "hero-arbeitsbereich",
    })).toEqual({
      hiddenSections: ["metrics"],
      sectionOrder: defaultDashboardSectionOrder,
      artworkEnabled: false,
      artworkId: defaultDashboardArtworkId,
    });
  });

  it("ergänzt bei alten Daten ohne Reihenfolge die vollständige Standardreihenfolge", () => {
    const migrated = migrateDashboardPreferences({ hiddenSections: [] });

    expect(migrated.sectionOrder).toEqual(defaultDashboardSectionOrder);
    expect(new Set(migrated.sectionOrder)).toEqual(new Set(allDashboardSections));
  });

  it("erhält Reihenfolge und Artwork aus Version 2 und entfernt doppelte oder unbekannte Bereiche", () => {
    const migrated = migrateDashboardPreferences({
      hiddenSections: ["metrics"],
      sectionOrder: ["wrapt", "server", "wrapt", "unbekannt"],
      artworkEnabled: true,
      artworkId: "hero-arbeitsbereich",
    }, 2);

    expect(migrated.artworkEnabled).toBe(true);
    expect(migrated.artworkId).toBe("hero-arbeitsbereich");
    expect(migrated.sectionOrder.slice(0, 2)).toEqual(["wrapt", "server"]);
    expect(migrated.sectionOrder).toHaveLength(allDashboardSections.length);
    expect(new Set(migrated.sectionOrder)).toEqual(new Set(allDashboardSections));
  });

  it("verwendet bei einer unbekannten Motiv-ID das Doku-Startmotiv", () => {
    expect(getDashboardArtwork("unbekannt").id).toBe(defaultDashboardArtworkId);
  });
});

describe("Reihenfolge der Dashboard-Bereiche", () => {
  it("verschiebt einen Bereich schrittweise nach oben und unten", () => {
    const moveSection = useDashboardPreferences.getState().moveSection;

    moveSection("server", "down");
    expect(useDashboardPreferences.getState().sectionOrder.slice(0, 2)).toEqual(["runtime", "server"]);

    moveSection("server", "up");
    expect(useDashboardPreferences.getState().sectionOrder).toEqual(defaultDashboardSectionOrder);
  });

  it("lässt Bereiche an den Rändern stehen", () => {
    const moveSection = useDashboardPreferences.getState().moveSection;

    moveSection("server", "up");
    expect(useDashboardPreferences.getState().sectionOrder).toEqual(defaultDashboardSectionOrder);

    moveSection("commands", "down");
    expect(useDashboardPreferences.getState().sectionOrder).toEqual(defaultDashboardSectionOrder);
  });
});
