// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { dashboardArtworks, defaultDashboardArtworkId } from "./dashboardArtwork";
import { preloadDashboardArtwork } from "./dashboardArtworkPreload";

const STORAGE_KEY = "wrapt.dashboard-preferences.v1";

function storedArtwork(state: Record<string, unknown>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, state }));
}

function preloadLink(): HTMLLinkElement | null {
  return document.head.querySelector<HTMLLinkElement>("link[data-dashboard-artwork]");
}

function backgroundOf(id: string): string {
  const artwork = dashboardArtworks.find((entry) => entry.id === id);
  if (artwork === undefined) throw new Error(`Unbekanntes Motiv: ${id}`);
  return artwork.background;
}

describe("Dashboard-Artwork-Preload", () => {
  beforeEach(() => {
    window.localStorage.clear();
    preloadLink()?.remove();
  });

  it("legt keinen Preload an, solange der Hintergrund ausgeschaltet ist", () => {
    storedArtwork({ artworkEnabled: false, artworkId: "hero-arbeitsbereich" });
    preloadDashboardArtwork();
    expect(preloadLink()).toBeNull();
  });

  it("legt keinen Preload an, wenn noch gar keine Einstellung existiert", () => {
    preloadDashboardArtwork();
    expect(preloadLink()).toBeNull();
  });

  it("holt das gespeicherte Motiv vor, sobald der Hintergrund aktiv ist", () => {
    storedArtwork({ artworkEnabled: true, artworkId: "hero-arbeitsbereich" });
    preloadDashboardArtwork();

    const link = preloadLink();
    expect(link?.getAttribute("rel")).toBe("preload");
    expect(link?.getAttribute("as")).toBe("image");
    expect(link?.getAttribute("fetchpriority")).toBe("high");
    expect(link?.getAttribute("href")).toBe(backgroundOf("hero-arbeitsbereich"));
  });

  it("übernimmt das übergebene Motiv, ohne den Speicher zu verändern", () => {
    storedArtwork({ artworkEnabled: true, artworkId: defaultDashboardArtworkId });
    preloadDashboardArtwork("hero-terminal");

    expect(preloadLink()?.getAttribute("href")).toBe(backgroundOf("hero-terminal"));
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}")).toMatchObject({
      state: { artworkId: defaultDashboardArtworkId },
    });
  });

  it("verwendet beim Hover niedrige Priorität für das gespeicherte Motiv", () => {
    storedArtwork({ artworkEnabled: true, artworkId: "hero-arbeitsbereich" });
    preloadDashboardArtwork(undefined, "low");
    expect(preloadLink()?.getAttribute("fetchpriority")).toBe("low");
    expect(preloadLink()?.getAttribute("href")).toBe(backgroundOf("hero-arbeitsbereich"));
  });

  it("hebt die Priorität beim anschließenden Öffnen ohne zweiten Preload an", () => {
    preloadDashboardArtwork("hero-arbeitsbereich", "low");
    const link = preloadLink();
    preloadDashboardArtwork("hero-arbeitsbereich");
    expect(preloadLink()).toBe(link);
    expect(link?.getAttribute("fetchpriority")).toBe("high");
  });

  it("wechselt den Preload beim Motivwechsel statt einen zweiten anzulegen", () => {
    preloadDashboardArtwork("hero-arbeitsbereich");
    preloadDashboardArtwork("hero-terminal");

    expect(document.head.querySelectorAll("link[data-dashboard-artwork]")).toHaveLength(1);
    expect(preloadLink()?.getAttribute("href")).toBe(backgroundOf("hero-terminal"));
  });

  it("lässt einen unveränderten Preload unangetastet", () => {
    preloadDashboardArtwork("hero-arbeitsbereich");
    const first = preloadLink();
    preloadDashboardArtwork("hero-arbeitsbereich");

    expect(preloadLink()).toBe(first);
  });

  it("lädt bei kaputtem Speicherinhalt gar nichts, statt zu werfen", () => {
    window.localStorage.setItem(STORAGE_KEY, "{kein json");
    expect(() => preloadDashboardArtwork()).not.toThrow();
    expect(preloadLink()).toBeNull();
  });

  it("verwendet bei unbekannter gespeicherter ID das Startmotiv", () => {
    storedArtwork({ artworkEnabled: true, artworkId: "gibt-es-nicht" });
    preloadDashboardArtwork();
    expect(preloadLink()?.getAttribute("href")).toBe(backgroundOf(defaultDashboardArtworkId));
  });

  it("liefert für jedes Motiv getrennte Vorschau- und Hintergrundvarianten", () => {
    for (const artwork of dashboardArtworks) {
      expect(artwork.thumbnail, `${artwork.id} braucht eine Vorschau`).toMatch(/-thumb\.webp$/);
      expect(artwork.background, `${artwork.id} braucht einen Hintergrund`).toMatch(/-bg\.webp$/);
    }
  });
});
