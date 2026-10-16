import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("preloadStatusArtwork", () => {
  it("wärmt nur das angefragte Motiv einmal vor und erlaubt Fehler-Retry", async () => {
    vi.resetModules();
    const images: FakeImage[] = [];
    class FakeImage {
      src = "";
      decoding = "";
      fetchPriority = "";
      onerror?: () => void;
      decode = vi.fn().mockResolvedValue(undefined);
      constructor() { images.push(this); }
    }
    vi.stubGlobal("Image", FakeImage);
    const { preloadStatusArtwork } = await import("./statusArtworkPreload");
    preloadStatusArtwork("changelog");
    preloadStatusArtwork("changelog");
    expect(images).toHaveLength(1);
    expect(images[0]!.src).toContain("changelog-night-sky-surface.webp");
    preloadStatusArtwork("usage");
    expect(images).toHaveLength(2);
    expect(images[1]!.src).toContain("hero-notizen-nutzung-surface.webp");
    expect(images.every((image) => image.fetchPriority === "low" && image.decoding === "async")).toBe(true);
    images[0]!.onerror?.();
    preloadStatusArtwork("changelog");
    expect(images).toHaveLength(3);
    expect(images[2]!.src).toBe(images[0]!.src);
  });

  it("blockiert den Trigger bei fehlender Browser-API nicht", async () => {
    vi.resetModules();
    vi.stubGlobal("Image", undefined);
    const { preloadStatusArtwork } = await import("./statusArtworkPreload");
    expect(() => preloadStatusArtwork("changelog")).not.toThrow();
  });
});
