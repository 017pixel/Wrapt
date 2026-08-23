import type { AppearanceTheme } from "@wrapt/contracts";

export function appearanceThemeCssVariables(theme: AppearanceTheme): Record<string, string> {
  const { colors } = theme;
  return {
    "--wrapt-accent": colors.accent,
    "--wrapt-surface-base": colors.background,
    "--wrapt-surface-sidebar": colors.sidebar,
    "--wrapt-surface-topbar": colors.topbar,
    "--wrapt-surface-bottom-bar": colors.bottomBar,
    "--color-accent": colors.accent,
    "--surface-base": colors.background,
    "--surface-raised": colors.sidebar,
    "--surface-overlay": colors.bottomBar,
    "--surface-sunken": colors.background,
    "--color-ink-950": colors.background,
    "--color-ink-900": colors.sidebar,
    "--color-ink-875": colors.topbar,
    "--color-ink-850": colors.bottomBar,
  };
}

export function applyAppearanceTheme(theme: AppearanceTheme): void {
  const root = document.documentElement;
  root.dataset.themePreset = theme.preset;
  for (const [property, value] of Object.entries(appearanceThemeCssVariables(theme))) {
    root.style.setProperty(property, value);
  }
}
