// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { applyAppearanceTheme, appearanceThemeCssVariables } from "./themeRuntime";
import { defaultAppearanceTheme } from "@wrapt/contracts";

describe("Theme-Runtime", () => {
  it("übersetzt Projektfarben in semantische CSS-Variablen", () => {
    const variables = appearanceThemeCssVariables(defaultAppearanceTheme);

    expect(variables["--wrapt-accent"]).toBe(defaultAppearanceTheme.colors.accent);
    expect(variables["--wrapt-surface-base"]).toBe(defaultAppearanceTheme.colors.background);
    expect(variables["--wrapt-surface-sidebar"]).toBe(defaultAppearanceTheme.colors.sidebar);
    expect(variables["--surface-base"]).toBe(defaultAppearanceTheme.colors.background);
    expect(variables["--surface-raised"]).toBe(defaultAppearanceTheme.colors.sidebar);
    expect(variables["--surface-overlay"]).toBe(defaultAppearanceTheme.colors.bottomBar);
  });

  it("wendet Theme, Preset und Reset-fähige Attribute an", () => {
    const root = document.documentElement;
    const setProperty = vi.spyOn(root.style, "setProperty");

    applyAppearanceTheme(defaultAppearanceTheme);

    expect(root.dataset.themePreset).toBe("wrapt-standard");
    expect(setProperty).toHaveBeenCalledWith("--wrapt-accent", defaultAppearanceTheme.colors.accent);
  });
});
