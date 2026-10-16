// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OVERLAY_TRANSPARENCY,
  OVERLAY_TRANSPARENCY_STORAGE_KEY,
  initializeOverlayTransparency,
  normalizeOverlayTransparency,
  readOverlayTransparency,
  writeOverlayTransparency,
} from "./overlayTransparency";

describe("Overlay-Transparenz", () => {
  const cleanups: (() => void)[] = [];

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
  });

  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.restoreAllMocks();
  });

  it.each([
    [-100, 0], [0, 0], [55.6, 56], [100, 100], [200, 200], [300, 300], [999, 300],
    [NaN, 100], [Infinity, 100], ["100", 100], [null, 100], [{ intensity: 100 }, 100],
  ])("begrenzt oder verwirft ungültige Intensität %j", (input, expected) => {
    expect(normalizeOverlayTransparency(input)).toBe(expected);
  });

  it("startet ohne Präferenz mit der gemeinsamen Glasintensität", () => {
    cleanups.push(initializeOverlayTransparency());
    expect(readOverlayTransparency()).toBe(DEFAULT_OVERLAY_TRANSPARENCY);
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("1");
  });

  it("stellt gespeicherte Grenzwerte beim erneuten Start wieder her", () => {
    writeOverlayTransparency(300);
    document.documentElement.removeAttribute("style");
    cleanups.push(initializeOverlayTransparency());
    expect(readOverlayTransparency()).toBe(300);
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("3");

    writeOverlayTransparency(0);
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("0");
    expect(localStorage.getItem(OVERLAY_TRANSPARENCY_STORAGE_KEY)).toBe("0");
  });

  it.each(["kaputt", "{}", "null", '"75"', "false"])("nutzt bei beschädigter Präferenz %s den Standard", (saved) => {
    localStorage.setItem(OVERLAY_TRANSPARENCY_STORAGE_KEY, saved);
    expect(readOverlayTransparency()).toBe(DEFAULT_OVERLAY_TRANSPARENCY);
  });

  it("behält die numerische Präferenz bisheriger Versionen unverändert", () => {
    localStorage.setItem(OVERLAY_TRANSPARENCY_STORAGE_KEY, "55");
    cleanups.push(initializeOverlayTransparency());
    expect(readOverlayTransparency()).toBe(55);
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("0.55");
  });

  it("wendet die Auswahl auch bei gesperrtem Speicher live an", () => {
    const readBlocked = { getItem: () => { throw new Error("Storage gesperrt"); } };
    const writeBlocked = { setItem: () => { throw new Error("Storage gesperrt"); } };
    expect(readOverlayTransparency(readBlocked)).toBe(DEFAULT_OVERLAY_TRANSPARENCY);
    expect(writeOverlayTransparency(75, writeBlocked)).toBe(75);
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("0.75");
  });

  it("übernimmt Änderungen und das Löschen der Präferenz aus einem anderen Tab", () => {
    cleanups.push(initializeOverlayTransparency());
    window.dispatchEvent(new StorageEvent("storage", {
      key: OVERLAY_TRANSPARENCY_STORAGE_KEY, newValue: "100",
    }));
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("1");
    window.dispatchEvent(new StorageEvent("storage", { key: "anderer-key", newValue: "0" }));
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("1");
    window.dispatchEvent(new StorageEvent("storage", { key: null, newValue: null }));
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("1");
  });

  it("entfernt Tab-Synchronisierung beim Aufräumen", () => {
    const cleanup = initializeOverlayTransparency();
    cleanup();
    window.dispatchEvent(new StorageEvent("storage", {
      key: OVERLAY_TRANSPARENCY_STORAGE_KEY, newValue: "100",
    }));
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("1");
  });
});
