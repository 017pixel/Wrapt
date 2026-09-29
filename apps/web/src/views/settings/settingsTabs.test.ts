import { describe, expect, it } from "vitest";
import { normalizeSettingsTab, settingsTabIds, settingsTabs } from "./settingsTabs";

describe("settingsTabs", () => {
  it("behält den alten Workspace-Deep-Link für das Layout bei", () => {
    expect(settingsTabIds).toContain("workspace");
    expect(normalizeSettingsTab("workspace")).toBe("layout");
  });

  it("ordnet Client-Einstellungen, Layout und Workspaces sichtbar in Ebenen", () => {
    expect(settingsTabs.map((tab) => tab.group)).toEqual([
      ...Array.from({ length: 7 }, () => "Wrapt"),
      ...Array.from({ length: 4 }, () => "Oberfläche & Bedienung"),
      "Verbindungen",
    ]);
  });
});
