// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { uiSettingsKeys } from "@wrapt/contracts";
import { useAppPreferences } from "../../stores/appPreferences";
import { useUsagePreferences } from "../../stores/usagePreferences";
import { settingsAdapters, settingsAdaptersByKey } from "./adapters";

beforeEach(() => {
  window.localStorage.clear();
  useAppPreferences.setState({ defaultPage: "dashboard", hermesV2Enabled: false });
  useUsagePreferences.setState({ limitsView: "both", density: "compact" });
});

describe("Einstellungs-Adapter", () => {
  it("registriert jeden Vertragsschlüssel genau einmal", () => {
    expect(settingsAdapters.map((adapter) => adapter.key).sort()).toEqual([...uiSettingsKeys].sort());
    expect(settingsAdapters).toHaveLength(uiSettingsKeys.length);
  });

  it("liest Zustand-Stores als versioniertes Serverformat", () => {
    useAppPreferences.setState({ defaultPage: "usage", hermesV2Enabled: true });
    expect(settingsAdaptersByKey.get("appPreferences")?.read()).toEqual({
      state: { defaultPage: "usage", hermesV2Enabled: true },
      version: 2,
    });
  });

  it("wendet einen Serverwert auf den Store an", async () => {
    await settingsAdaptersByKey.get("appPreferences")?.apply({
      state: { defaultPage: "settings", hermesV2Enabled: true },
      version: 2,
    });
    expect(useAppPreferences.getState().defaultPage).toBe("settings");
    expect(useAppPreferences.getState().hermesV2Enabled).toBe(true);
  });

  it("gleicht die Darstellungspräferenzen der Nutzung ab", async () => {
    await settingsAdaptersByKey.get("usagePreferences")?.apply({
      state: { version: 1, preset: "custom", limitsView: "list", density: "normal" },
      version: 1,
    });
    expect(useUsagePreferences.getState().limitsView).toBe("list");
    expect(useUsagePreferences.getState().density).toBe("normal");
  });

  it("speichert die Transparenz als Zahl und wendet sie sofort an", async () => {
    await settingsAdaptersByKey.get("overlayTransparency")?.apply(175);
    expect(settingsAdaptersByKey.get("overlayTransparency")?.read()).toBe(175);
    expect(document.documentElement.style.getPropertyValue("--glass-intensity")).toBe("1.75");
  });
});
