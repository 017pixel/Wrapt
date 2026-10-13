import { describe, expect, it } from "vitest";
import { CARD_MAX_HEIGHT, CARD_WIDTH, positionAnchoredCard } from "./anchoredCardPosition";

const viewport = { width: 1280, height: 800 };

describe("positionAnchoredCard", () => {
  it("setzt die Karte rechtsbündig über einen Trigger am rechten Rand", () => {
    const position = positionAnchoredCard(
      { top: 750, bottom: 792, left: 1080, right: 1220, width: 140 },
      300,
      viewport,
    );
    expect(position.placement).toBe("above");
    expect(position.left).toBe(1220 - CARD_WIDTH);
    expect(position.width).toBe(CARD_WIDTH);
    expect(position.height).toBe(300);
    expect(position.bottom).toBe(800 - 750 + 10);
  });

  it("klemmt die Karte am linken Rand und richtet den Pfeil auf die Triggermitte", () => {
    const anchor = { top: 750, bottom: 792, left: 28, right: 120, width: 92 };
    const position = positionAnchoredCard(anchor, 300, viewport);
    expect(position.left).toBe(12);
    // Pfeilabstand = Kartenbreite minus Abstand der Triggermitte vom linken Kartenrand.
    expect(position.arrowOffset).toBe(position.left + position.width - (anchor.left + anchor.width / 2));
  });

  it("begrenzt die Höhe auf den freien Platz und weicht nach unten aus", () => {
    const position = positionAnchoredCard(
      { top: 20, bottom: 60, left: 600, right: 700, width: 100 },
      CARD_MAX_HEIGHT,
      { width: 1280, height: 320 },
    );
    expect(position.placement).toBe("below");
    expect(position.height).toBe(320 - 60 - 10 - 12);
    expect(position.bottom).toBe(12);
  });

  it("passt die Breite auf schmalen Viewports vollständig ein", () => {
    const position = positionAnchoredCard(
      { top: 600, bottom: 640, left: 200, right: 300, width: 100 },
      400,
      { width: 340, height: 800 },
    );
    expect(position.width).toBe(316);
    expect(position.left).toBe(12);
    expect(position.height).toBe(400);
  });

  it("lässt alle Limits über 460 Pixel hinaus wachsen und bleibt rechts verankert", () => {
    const position = positionAnchoredCard(
      { top: 750, bottom: 792, left: 1080, right: 1220, width: 140 },
      620, viewport, { width: 500, maxHeight: Infinity },
    );
    expect(position.width).toBe(500);
    expect(position.height).toBe(620);
    expect(position.left).toBe(720);
  });

  it("erweitert den Changelog vom Versionsanker nach rechts", () => {
    const position = positionAnchoredCard(
      { top: 750, bottom: 792, left: 68, right: 160, width: 92 },
      900, viewport, { width: 480, maxHeight: 640, align: "start" },
    );
    expect(position.left).toBe(68);
    expect(position.width).toBe(480);
    expect(position.height).toBe(640);
  });

  it("hält auch sehr schmale und flache Fenster innerhalb des Viewports", () => {
    const position = positionAnchoredCard(
      { top: 160, bottom: 190, left: 40, right: 160, width: 120 },
      800, { width: 280, height: 220 }, { width: 500, maxHeight: Infinity },
    );
    expect(position.width).toBe(256);
    expect(position.height).toBe(138);
    expect(position.bottom).toBe(70);
  });
});
