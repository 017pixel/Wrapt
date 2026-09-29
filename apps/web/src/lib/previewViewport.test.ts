import { describe, expect, it } from "vitest";
import { normalizePreviewViewportDimension, orientPreviewViewportSize } from "./previewViewport";

describe("Preview-Viewportmaße", () => {
  it("begrenzt freie Maße und rundet auf CSS-Pixel", () => {
    expect(normalizePreviewViewportDimension(280.6, 390)).toBe(281);
    expect(normalizePreviewViewportDimension(100, 390)).toBe(240);
    expect(normalizePreviewViewportDimension(3_000, 390)).toBe(2_560);
    expect(normalizePreviewViewportDimension("", 390)).toBe(390);
    expect(normalizePreviewViewportDimension("ungültig", 390)).toBe(390);
  });

  it("tauscht die CSS-Viewportmaße beim Drehen", () => {
    const portrait = { width: 390, height: 844 };
    expect(orientPreviewViewportSize(portrait, "portrait")).toEqual(portrait);
    expect(orientPreviewViewportSize(portrait, "landscape")).toEqual({ width: 844, height: 390 });
  });
});
