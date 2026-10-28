import { describe, expect, it } from "vitest";
import { normalizeSettingsTab, settingsTabIds, settingsTabs } from "./settingsTabs";

describe("settingsTabs", () => {
  it("führt entfernte Einstellungsbereiche auf Allgemein zurück", () => {
    expect(settingsTabIds).toContain("workspace");
    for (const tab of ["workspace", "layout", "start-app"] as const) {
      expect(normalizeSettingsTab(tab)).toBe("allgemein");
      expect(settingsTabs.some((entry) => entry.id === (tab as string))).toBe(false);
    }
  });

  it("ordnet Client-Einstellungen und Workspaces sichtbar in Ebenen", () => {
    expect(settingsTabs.map((tab) => tab.group)).toEqual([
      ...Array.from({ length: 7 }, () => "Wrapt"),
      ...Array.from({ length: 3 }, () => "Oberfläche & Bedienung"),
      "Verbindungen",
    ]);
  });
});
