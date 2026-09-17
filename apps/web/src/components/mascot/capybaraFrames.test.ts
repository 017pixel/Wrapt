import { describe, expect, it } from "vitest";
import { CAPYBARA_FRAMES, CAPYBARA_GRID } from "./capybaraFrames";

describe("Capybara-Frames", () => {
  it("verwendet für jeden Zustand ein eigenes 64x64-Asset", () => {
    expect(CAPYBARA_GRID).toEqual({ width: 64, height: 64 });
    expect(Object.keys(CAPYBARA_FRAMES)).toHaveLength(17);
    Object.values(CAPYBARA_FRAMES).forEach((asset) => {
      expect(asset).toMatch(/capybara-[a-z-]+\.png/);
    });
  });

  it("hält die bewegten Posen als getrennte Assets auseinander", () => {
    expect(CAPYBARA_FRAMES.walkA).not.toBe(CAPYBARA_FRAMES.walkB);
    expect(CAPYBARA_FRAMES.happyA).not.toBe(CAPYBARA_FRAMES.happyB);
    expect(CAPYBARA_FRAMES.sneezeA).not.toBe(CAPYBARA_FRAMES.sneezeC);
    expect(CAPYBARA_FRAMES.hopA).not.toBe(CAPYBARA_FRAMES.hopC);
    expect(CAPYBARA_FRAMES.lookLeft).not.toBe(CAPYBARA_FRAMES.lookRight);
  });

  it("legt die ruhenden und kontextbezogenen Zustände fest", () => {
    expect(CAPYBARA_FRAMES.calm).toContain("capybara-idle");
    expect(CAPYBARA_FRAMES.worry).toContain("capybara-worry");
    expect(CAPYBARA_FRAMES.sleep).toContain("capybara-sleep");
  });
});
