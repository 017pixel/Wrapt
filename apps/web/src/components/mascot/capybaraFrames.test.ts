import { describe, expect, it } from "vitest";
import { CAPYBARA_FRAMES, CAPYBARA_GRID, frameIsValid, framePixels } from "./capybaraFrames";

describe("Capybara-Frames", () => {
  it.each(Object.entries(CAPYBARA_FRAMES))("Frame %s ist ein gültiges Raster", (_name, frame) => {
    expect(frame).toHaveLength(CAPYBARA_GRID.height);
    frame.forEach((row, index) => {
      expect(row, `Zeile ${index}`).toHaveLength(CAPYBARA_GRID.width);
    });
    expect(frameIsValid(frame)).toBe(true);
  });

  it("liefert nur sichtbare Pixel mit bekannter Farbe", () => {
    const pixels = framePixels(CAPYBARA_FRAMES.calm);
    expect(pixels.length).toBeGreaterThan(80);
    expect(pixels.every((pixel) => pixel.tone === "line" || pixel.tone === "fur" || pixel.tone === "light" || pixel.tone === "eye" || pixel.tone === "nose")).toBe(true);
  });

  it("hält bewegte Posen als eigene Varianten auseinander", () => {
    expect(CAPYBARA_FRAMES.walkA).not.toEqual(CAPYBARA_FRAMES.walkB);
    expect(CAPYBARA_FRAMES.lookLeft).not.toEqual(CAPYBARA_FRAMES.lookRight);
    expect(CAPYBARA_FRAMES.calm).not.toEqual(CAPYBARA_FRAMES.blink);
  });
});
