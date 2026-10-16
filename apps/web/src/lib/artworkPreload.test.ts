import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("Artwork-Vorladen", () => {
  it("ignoriert leere Adressen und respektiert den Datensparmodus", async () => {
    vi.resetModules();
    const ImageMock = vi.fn();
    vi.stubGlobal("Image", ImageMock);
    vi.stubGlobal("navigator", { connection: { saveData: true } });
    const { preloadArtwork } = await import("./artworkPreload");
    preloadArtwork("");
    preloadArtwork("/artwork.webp");
    expect(ImageMock).not.toHaveBeenCalled();
  });

  it("erlaubt nach einem Dekodierfehler einen neuen Versuch", async () => {
    vi.resetModules();
    class FakeImage {
      src = "";
      decoding = "";
      fetchPriority = "";
      decode = vi.fn().mockRejectedValue(new Error("Bild beschädigt"));
    }
    const ImageMock = vi.fn(function () { return new FakeImage(); });
    vi.stubGlobal("Image", ImageMock);
    const { preloadArtwork } = await import("./artworkPreload");
    preloadArtwork("/artwork.webp");
    await Promise.resolve();
    preloadArtwork("/artwork.webp");
    expect(ImageMock).toHaveBeenCalledTimes(2);
  });
});
