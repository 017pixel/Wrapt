import { describe, expect, it } from "vitest";
import { normalizeComposerSettings } from "./normalize-settings.js";

describe("Freigabemodus und effektiver Bypass", () => {
  it.each(["manual", "smart", "off"] as const)("bietet bei gemeldetem Modus %s alle nativen Optionen", (mode) => {
    const result = normalizeComposerSettings({ approval_mode: mode, yolo: false });
    expect(result.approvals).toEqual({ mode, effectiveBypass: mode === "off", editable: true, scope: "global",
      options: ["manual", "smart", "off"].map((mode) => ({ mode, available: true })) });
  });
  it("erhält unabhängigen Yolo-Bypass auch bei manuellen Freigaben", () => {
    expect(normalizeComposerSettings({ approval_mode: "manual", yolo: true }).approvals.effectiveBypass).toBe(true);
    expect(normalizeComposerSettings({ approval_mode: "off" }).approvals.effectiveBypass).toBe(true);
    expect(normalizeComposerSettings({ approval_mode: "manual" }).approvals.effectiveBypass).toBeNull();
  });
  it.each([{}, { approval_mode: "ask" }, { approval_mode: false }])("behauptet bei unbekanntem Modus keine Schaltfähigkeit", (raw) => {
    expect(normalizeComposerSettings(raw).approvals).toMatchObject({ mode: null, editable: false,
      options: ["manual", "smart", "off"].map((mode) => ({ mode, available: false })) });
  });
});
