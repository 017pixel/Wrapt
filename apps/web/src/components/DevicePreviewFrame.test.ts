// @vitest-environment jsdom

import { createElement } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateDevicePreviewScale, changeDevicePreviewScaleFactor, clampDevicePreviewScaleFactor, devicePreviewEdgeInsetRatio, DevicePreviewFrame } from "./DevicePreviewFrame";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Geräte-Preview-Skalierung", () => {
  it("vergrößert ein Smartphone bis auf zehn Prozent Randabstand", () => {
    const outerWidth = 421;
    const outerHeight = 880;
    const scale = calculateDevicePreviewScale({
      stageWidth: 1_000,
      stageHeight: 1_200,
      outerWidth,
      outerHeight,
      devicePixelRatio: 2,
    });

    expect(scale).toBeGreaterThan(1);
    const availableHeight = 1_200 * (1 - devicePreviewEdgeInsetRatio * 2);
    expect(outerHeight * scale).toBeGreaterThan(availableHeight - 1);
    expect(outerHeight * scale).toBeLessThanOrEqual(availableHeight);
    expect(outerWidth * scale).toBeLessThanOrEqual(1_000 * (1 - devicePreviewEdgeInsetRatio * 2));
  });

  it("verkleinert das Gerät proportional in schmalen Gruppen-Slots", () => {
    const outerWidth = 421;
    const outerHeight = 880;
    const scale = calculateDevicePreviewScale({
      stageWidth: 320,
      stageHeight: 420,
      outerWidth,
      outerHeight,
      devicePixelRatio: 1,
    });

    expect(scale).toBeLessThan(1);
    expect(outerWidth * scale).toBeLessThanOrEqual(320 * 0.8);
    expect(outerHeight * scale).toBeLessThanOrEqual(420 * 0.8);
  });

  it("begrenzt die manuelle Größenkorrektur auf den vorgesehenen Bereich", () => {
    expect(clampDevicePreviewScaleFactor(0.1)).toBe(0.5);
    expect(clampDevicePreviewScaleFactor(3)).toBe(2);
    expect(clampDevicePreviewScaleFactor(Number.NaN)).toBe(1);
  });

  it("ändert die manuelle Größenkorrektur in Zehn-Prozent-Schritten", () => {
    expect(changeDevicePreviewScaleFactor(1, 1)).toBe(1.1);
    expect(changeDevicePreviewScaleFactor(1, -1)).toBe(0.9);
    expect(changeDevicePreviewScaleFactor(2, 1)).toBe(2);
    expect(changeDevicePreviewScaleFactor(0.5, -1)).toBe(0.5);
  });

  it("behält das iframe beim Wechsel auf freie Viewportmaße gemountet", () => {
    class ResizeObserverMock {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    vi.stubGlobal("cancelAnimationFrame", (handle: number) => window.clearTimeout(handle));

    const frame = (viewportSize: { width: number; height: number } | null) => createElement(
      DevicePreviewFrame,
      { deviceId: "iphone-13", orientation: "portrait", viewportSize, children: createElement("iframe", { title: "Preview" }) },
    );
    const view = render(frame(null));
    const originalIframe = view.container.querySelector("iframe");
    view.rerender(frame({ width: 412, height: 915 }));

    expect(view.container.querySelector("iframe")).toBe(originalIframe);
    const screen = view.container.querySelector<HTMLElement>(".device-preview-screen");
    expect(screen?.style.width).toBe("412px");
    expect(screen?.style.height).toBe("915px");
  });
});
