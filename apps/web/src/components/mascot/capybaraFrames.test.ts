import { describe, expect, it } from "vitest";
import { CAPYBARA_CONFETTI_FRAMES, CAPYBARA_FRAMES, CAPYBARA_GRID, CAPYBARA_ZZZ_FRAMES } from "./capybaraFrames";

describe("Capybara-Frames", () => {
  it("verwendet für jeden Zustand ein eigenes 64x64-Asset", () => {
    expect(CAPYBARA_GRID).toEqual({ width: 64, height: 64 });
    expect(Object.keys(CAPYBARA_FRAMES)).toHaveLength(20);
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
    expect(CAPYBARA_FRAMES.yawnA).not.toBe(CAPYBARA_FRAMES.yawnB);
  });

  it("legt die ruhenden und kontextbezogenen Zustände fest", () => {
    expect(CAPYBARA_FRAMES.calm).toContain("capybara-idle");
    expect(CAPYBARA_FRAMES.worry).toContain("capybara-worry");
    expect(CAPYBARA_FRAMES.sleep).toContain("capybara-sleep");
    expect(CAPYBARA_FRAMES.party).toContain("capybara-party");
  });

  it("stellt die Zzz-Frames in aufsteigender Größe bereit", () => {
    expect(CAPYBARA_ZZZ_FRAMES).toHaveLength(3);
    expect(CAPYBARA_ZZZ_FRAMES[0]).toContain("zzz-small");
    expect(CAPYBARA_ZZZ_FRAMES[2]).toContain("zzz-large");
  });

  it("stellt drei Konfettifetzen für die Party bereit", () => {
    expect(CAPYBARA_CONFETTI_FRAMES).toHaveLength(3);
    CAPYBARA_CONFETTI_FRAMES.forEach((asset) => {
      expect(asset).toContain("confetti");
    });
    expect(new Set(CAPYBARA_CONFETTI_FRAMES).size).toBe(3);
  });
});
