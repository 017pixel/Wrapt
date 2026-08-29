// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { applyAppearanceTheme, appearanceThemeCssVariables, themeColorToHex } from "./themeRuntime";
import { defaultAppearanceTheme } from "@wrapt/contracts";

describe("Theme-Runtime", () => {
  it("übersetzt Projektfarben in semantische CSS-Variablen", () => {
    const variables = appearanceThemeCssVariables(defaultAppearanceTheme);

    expect(variables["--wrapt-accent"]).toBe(defaultAppearanceTheme.colors.accent);
    expect(variables["--wrapt-hover"]).toBe(defaultAppearanceTheme.colors.hover);
    expect(variables["--wrapt-surface-base"]).toBe(defaultAppearanceTheme.colors.background);
    expect(variables["--wrapt-surface-sidebar"]).toBe(defaultAppearanceTheme.colors.sidebar);
    expect(variables["--wrapt-surface-topbar"]).toBe(defaultAppearanceTheme.colors.topbar);
    expect(variables["--wrapt-surface-bottom-bar"]).toBe(defaultAppearanceTheme.colors.bottomBar);
    expect(variables["--wrapt-input"]).toBe(defaultAppearanceTheme.colors.input);
    expect(variables["--surface-base"]).toBe(defaultAppearanceTheme.colors.background);
    expect(variables["--surface-raised"]).toBe(defaultAppearanceTheme.colors.surfaceRaised);
    expect(variables["--surface-overlay"]).toBe(defaultAppearanceTheme.colors.surfaceOverlay);
    expect(variables["--color-text"]).toBe(defaultAppearanceTheme.colors.text);
    expect(variables["--color-bad"]).toBe(defaultAppearanceTheme.colors.danger);
    expect(variables["--color-ok-soft"]).toContain(defaultAppearanceTheme.colors.success);
    expect(variables["--color-warn-line"]).toContain(defaultAppearanceTheme.colors.warning);
    expect(variables["--color-bad-soft"]).toContain(defaultAppearanceTheme.colors.danger);
    expect(variables["--color-line-strong"]).toBe(defaultAppearanceTheme.colors.borderStrong);
    expect(variables["--color-input"]).toBe(defaultAppearanceTheme.colors.input);
    expect(variables["--icon-green"]).toBe(defaultAppearanceTheme.colors.success);
    expect(variables["--syntax-keyword"]).toBe(defaultAppearanceTheme.colors.accent);
    expect(variables["--glass-tint"]).toContain(defaultAppearanceTheme.colors.topbar);
  });

  it("wendet Theme, Preset und Reset-fähige Attribute an", () => {
    const root = document.documentElement;
    const setProperty = vi.spyOn(root.style, "setProperty");

    applyAppearanceTheme(defaultAppearanceTheme);

    expect(root.dataset.themePreset).toBe("t3-code");
    expect(root.style.colorScheme).toBe("dark");
    expect(setProperty).toHaveBeenCalledWith("--wrapt-accent", defaultAppearanceTheme.colors.accent);
  });

  it("wandelt Hex und T3-OKLCH in sichere Farbfeld-Werte um", () => {
    expect(themeColorToHex("#ABCDEF")).toBe("#abcdef");
    expect(themeColorToHex("oklch(0.5 0 0)")).toBe("#636363");
    expect(themeColorToHex("var(--color-accent)")).toBeNull();
  });
});
