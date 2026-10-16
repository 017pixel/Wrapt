import { beforeEach, describe, expect, it, vi } from "vitest";
import { preloadRouteArtwork } from "./routeArtworkPreload";

const { preloadArtwork, preloadDashboardArtwork } = vi.hoisted(() => ({
  preloadArtwork: vi.fn(), preloadDashboardArtwork: vi.fn(),
}));
vi.mock("./artworkPreload", () => ({ preloadArtwork }));
vi.mock("./dashboardArtworkPreload", () => ({ preloadDashboardArtwork }));

beforeEach(() => vi.clearAllMocks());

describe("Artwork bei Routenabsicht", () => {
  it.each([
    ["/notizen", "hero-notizen-nutzung"],
    ["/orbit/notizen", "hero-notizen-nutzung"],
    ["/projects", "hero-arbeitsbereich"],
    ["/projects/projekt", "hero-fehlerdiagnose"],
    ["/t3-code", "hero-konfigurieren"],
    ["/code-editor", "hero-konfigurieren"],
  ])("holt bei %s genau das passende kleine Motiv vor", (path, motif) => {
    preloadRouteArtwork(path);
    expect(preloadArtwork).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(`${motif}-surface.webp`));
    expect(preloadDashboardArtwork).not.toHaveBeenCalled();
  });

  it("lädt fremde Routen und unbelegte Präfixe nicht vor", () => {
    for (const path of ["/settings", "/plugins", "/notizen-archiv", "/projects-archiv", "/t3-code-other"]) {
      preloadRouteArtwork(path);
    }
    expect(preloadArtwork).not.toHaveBeenCalled();
    expect(preloadDashboardArtwork).not.toHaveBeenCalled();
  });

  it("holt fürs Dashboard nur das gespeicherte aktivierte Motiv mit niedriger Priorität vor", () => {
    preloadRouteArtwork("/");
    expect(preloadDashboardArtwork).toHaveBeenCalledExactlyOnceWith(undefined, "low");
    expect(preloadArtwork).not.toHaveBeenCalled();
  });
});
