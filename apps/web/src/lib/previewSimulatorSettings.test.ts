import { describe, expect, it } from "vitest";
import {
  normalizePreviewSimulatorSettings,
  previewSimulatorSettingsKey,
  readPreviewSimulatorSettings,
  writePreviewSimulatorSettings,
} from "./previewSimulatorSettings";

describe("Preview-Simulator-Einstellungen", () => {
  it("persistiert Geräteauswahl, freie Größe und Leistenlayout je Session", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const settings = normalizePreviewSimulatorSettings({
      deviceId: "ipad-mini",
      orientation: "landscape",
      viewportSize: { width: 744, height: 1_133 },
      scaleFactor: 1.4,
      toolbarPosition: { x: 28, y: 36 },
      toolbarWidth: 680,
    });

    writePreviewSimulatorSettings("preview-runtime:test", settings, storage);

    expect(readPreviewSimulatorSettings("preview-runtime:test", storage)).toEqual(settings);
    expect(readPreviewSimulatorSettings("preview-runtime:other", storage).deviceId).toBeNull();
    expect(values.has(previewSimulatorSettingsKey("preview-runtime:test"))).toBe(true);
  });

  it("begrenzt gespeicherte Werte und verwirft ungültige Profile", () => {
    expect(normalizePreviewSimulatorSettings({
      deviceId: "unknown",
      orientation: "sideways",
      viewportSize: { width: 0, height: 3_000 },
      scaleFactor: 8,
      toolbarPosition: { x: -5, y: 12.3 },
      toolbarWidth: 20,
    })).toEqual({
      deviceId: null,
      orientation: "portrait",
      viewportSize: { width: 240, height: 2_560 },
      scaleFactor: 2,
      toolbarPosition: { x: 0, y: 12 },
      toolbarWidth: 280,
    });
  });
});
