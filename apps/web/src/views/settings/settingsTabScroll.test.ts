import { describe, expect, it } from "vitest";
import { scrollSettingsTabsByWheel, SETTINGS_TAB_WHEEL_LINE_HEIGHT } from "./settingsTabScroll";

function target(overrides: Partial<{ scrollWidth: number; clientWidth: number; scrollLeft: number }> = {}) {
  return { scrollWidth: 800, clientWidth: 400, scrollLeft: 100, ...overrides };
}

describe("scrollSettingsTabsByWheel", () => {
  it("scrollt bei vertikalem Mausrad horizontal", () => {
    const element = target();
    expect(scrollSettingsTabsByWheel(element, 0, 60)).toBe(true);
    expect(element.scrollLeft).toBe(160);
  });

  it("lässt die Seite am Anfang und Ende normal scrollen", () => {
    const start = target({ scrollLeft: 0 });
    expect(scrollSettingsTabsByWheel(start, 0, -60)).toBe(false);
    const end = target({ scrollLeft: 400 });
    expect(scrollSettingsTabsByWheel(end, 0, 60)).toBe(false);
  });

  it("bevorzugt ein horizontales Trackpad-Delta", () => {
    const element = target();
    expect(scrollSettingsTabsByWheel(element, -30, 2)).toBe(true);
    expect(element.scrollLeft).toBe(70);
  });

  it("nimmt bei dominantem Mausrad das senkrechte Delta", () => {
    const element = target();
    expect(scrollSettingsTabsByWheel(element, -30, 90)).toBe(true);
    expect(element.scrollLeft).toBe(190);
  });

  it("rechnet Zeilen- und Seitenmodus um und begrenzt den Bereich", () => {
    const lines = target();
    expect(scrollSettingsTabsByWheel(lines, 0, 1, 1)).toBe(true);
    expect(lines.scrollLeft).toBe(100 + SETTINGS_TAB_WHEEL_LINE_HEIGHT);

    const pages = target({ scrollLeft: 350 });
    expect(scrollSettingsTabsByWheel(pages, 0, 1, 2)).toBe(true);
    expect(pages.scrollLeft).toBe(400);
  });

  it("meldet ohne Überlauf nichts anderes", () => {
    const element = target({ scrollWidth: 400, clientWidth: 400, scrollLeft: 0 });
    expect(scrollSettingsTabsByWheel(element, 0, 60)).toBe(false);
    expect(element.scrollLeft).toBe(0);
  });
});
