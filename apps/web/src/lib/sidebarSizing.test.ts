import { describe, expect, it } from "vitest";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_MIN,
  clampSidebarWidth,
  parseSidebarLayout,
  resolveSidebarKeyboardResize,
  resolveSidebarPointerRelease,
  sidebarDisplayMode,
  sidebarLiveWidth,
  sidebarModeClassNames,
  snapSidebarWidth,
} from "./sidebarSizing";

describe("Seitenleisten-Geometrie", () => {
  it("hält die Breite im erlaubten Bereich und rundet", () => {
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_WIDTH_MIN);
    expect(clampSidebarWidth(500)).toBe(SIDEBAR_WIDTH_MAX);
    expect(clampSidebarWidth(255.6)).toBe(256);
    expect(clampSidebarWidth(Number.NaN)).toBe(SIDEBAR_WIDTH_DEFAULT);
  });

  it("rastet beim Loslassen auf den nächsten Punkt", () => {
    expect(snapSidebarWidth(176)).toBe(208);
    expect(snapSidebarWidth(190)).toBe(208);
    expect(snapSidebarWidth(200)).toBe(208);
    expect(snapSidebarWidth(240)).toBe(256);
    expect(snapSidebarWidth(310)).toBe(320);
    expect(snapSidebarWidth(399)).toBe(400);
  });

  it("überspringt beim Öffnen Rastpunkte unterhalb der Schwelle", () => {
    expect(snapSidebarWidth(181, 180)).toBe(208);
    expect(snapSidebarWidth(300, 180)).toBe(320);
  });

  it("respektiert eine engere Obergrenze, etwa im Tablet-Layout", () => {
    expect(snapSidebarWidth(300, 176, 225)).toBe(225);
    expect(sidebarLiveWidth(225, 150, 225)).toBe(225);
    expect(resolveSidebarPointerRelease({ liveWidth: 225, wasCollapsed: false, lastExpandedWidth: 225, maximum: 225 }))
      .toEqual({ collapsed: false, width: 225 });
    expect(resolveSidebarPointerRelease({ liveWidth: 190, wasCollapsed: false, lastExpandedWidth: 225, maximum: 225 }))
      .toEqual({ collapsed: false, width: 208 });
    expect(resolveSidebarKeyboardResize({ collapsed: false, width: 208, delta: 32, maximum: 225 }))
      .toEqual({ type: "resize", width: 225 });
  });

  it("folgt dem Zeiger auch unterhalb der Mindestbreite", () => {
    expect(sidebarLiveWidth(256, -80)).toBe(176);
    expect(sidebarLiveWidth(256, -140)).toBe(116);
    expect(sidebarLiveWidth(56, 160)).toBe(216);
    expect(sidebarLiveWidth(256, -400)).toBe(SIDEBAR_COLLAPSED_WIDTH);
    expect(sidebarLiveWidth(256, 400)).toBe(SIDEBAR_WIDTH_MAX);
  });

  it("leitet die Modi aus Breite und Zustand ab", () => {
    expect(sidebarDisplayMode(true, 256)).toBe("collapsed");
    expect(sidebarDisplayMode(false, 176)).toBe("compact");
    expect(sidebarDisplayMode(false, 177)).toBe("narrow");
    expect(sidebarDisplayMode(false, 199)).toBe("narrow");
    expect(sidebarDisplayMode(false, 200)).toBe("regular");
    expect(sidebarModeClassNames(false, 256)).toBe("");
    expect(sidebarModeClassNames(false, 190)).toBe("is-narrow");
    expect(sidebarModeClassNames(false, 176)).toBe("is-compact");
    expect(sidebarModeClassNames(true, 256)).toBe("is-collapsed is-compact");
  });
});

describe("Loslassen nach dem Ziehen", () => {
  it("klappt bis zur Mindestbreite mit Beschriftung ein und merkt sich die letzte Breite", () => {
    expect(resolveSidebarPointerRelease({ liveWidth: 176, wasCollapsed: false, lastExpandedWidth: 256 }))
      .toEqual({ collapsed: true, width: 256 });
    expect(resolveSidebarPointerRelease({ liveWidth: 149, wasCollapsed: false, lastExpandedWidth: 256 }))
      .toEqual({ collapsed: true, width: 256 });
  });

  it("bleibt oberhalb der Mindestbreite offen und rastet", () => {
    expect(resolveSidebarPointerRelease({ liveWidth: 177, wasCollapsed: false, lastExpandedWidth: 256 }))
      .toEqual({ collapsed: false, width: 208 });
    expect(resolveSidebarPointerRelease({ liveWidth: 240, wasCollapsed: false, lastExpandedWidth: 256 }))
      .toEqual({ collapsed: false, width: 256 });
  });

  it("öffnet aus dem eingeklappten Zustand erst über 180 px", () => {
    expect(resolveSidebarPointerRelease({ liveWidth: 179, wasCollapsed: true, lastExpandedWidth: 256 }))
      .toEqual({ collapsed: true, width: 256 });
    expect(resolveSidebarPointerRelease({ liveWidth: 181, wasCollapsed: true, lastExpandedWidth: 256 }))
      .toEqual({ collapsed: false, width: 208 });
    expect(resolveSidebarPointerRelease({ liveWidth: 300, wasCollapsed: true, lastExpandedWidth: 256 }))
      .toEqual({ collapsed: false, width: 320 });
  });
});

describe("Tastatur", () => {
  it("ändert die Breite in Acht-Pixel-Schritten", () => {
    expect(resolveSidebarKeyboardResize({ collapsed: false, width: 256, delta: -8 }))
      .toEqual({ type: "resize", width: 248 });
    expect(resolveSidebarKeyboardResize({ collapsed: false, width: 256, delta: 32 }))
      .toEqual({ type: "resize", width: 288 });
  });

  it("klappt am unteren Rand ein statt wirkungslos zu bleiben", () => {
    expect(resolveSidebarKeyboardResize({ collapsed: false, width: SIDEBAR_WIDTH_MIN, delta: -8 }))
      .toEqual({ type: "collapse" });
    expect(resolveSidebarKeyboardResize({ collapsed: false, width: 200, delta: -32 }))
      .toEqual({ type: "collapse" });
  });

  it("öffnet eingeklappt mit der gemerkten Breite über Pfeil rechts", () => {
    expect(resolveSidebarKeyboardResize({ collapsed: true, width: 256, delta: 8 }))
      .toEqual({ type: "expand", width: 256 });
    expect(resolveSidebarKeyboardResize({ collapsed: true, width: 256, delta: -8 })).toBeNull();
  });
});

describe("Gespeicherter Zustand", () => {
  it("liest alte Stände weiter", () => {
    expect(parseSidebarLayout(JSON.stringify({ collapsed: true, width: 208 })))
      .toEqual({ collapsed: true, width: 208 });
    expect(parseSidebarLayout(JSON.stringify({ collapsed: false, width: 360 })))
      .toEqual({ collapsed: false, width: 360 });
  });

  it("begrenzt zu große oder verdrehte Werte", () => {
    expect(parseSidebarLayout(JSON.stringify({ collapsed: false, width: 999 })))
      .toEqual({ collapsed: false, width: SIDEBAR_WIDTH_MAX });
    expect(parseSidebarLayout(JSON.stringify({ collapsed: false, width: 120 })))
      .toEqual({ collapsed: true, width: 208 });
    expect(parseSidebarLayout(JSON.stringify({ collapsed: false, width: 176 })))
      .toEqual({ collapsed: true, width: 208 });
  });

  it("fällt bei fehlenden oder ungültigen Daten zurück", () => {
    expect(parseSidebarLayout(null)).toEqual({ collapsed: false, width: SIDEBAR_WIDTH_DEFAULT });
    expect(parseSidebarLayout("kein json")).toEqual({ collapsed: false, width: SIDEBAR_WIDTH_DEFAULT });
    expect(parseSidebarLayout(JSON.stringify({ collapsed: "ja", width: 256 })))
      .toEqual({ collapsed: false, width: SIDEBAR_WIDTH_DEFAULT });
  });
});
