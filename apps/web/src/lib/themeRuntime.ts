import type { AppearanceTheme } from "@wrapt/contracts";

export function appearanceThemeCssVariables(theme: AppearanceTheme): Record<string, string> {
  const { colors } = theme;
  return {
    "--wrapt-accent": colors.accent,
    "--wrapt-accent-contrast": colors.accentContrast,
    "--wrapt-surface-base": colors.background,
    "--wrapt-surface": colors.surface,
    "--wrapt-surface-raised": colors.surfaceRaised,
    "--wrapt-surface-overlay": colors.surfaceOverlay,
    "--wrapt-surface-sidebar": colors.sidebar,
    "--wrapt-surface-topbar": colors.topbar,
    "--wrapt-surface-bottom-bar": colors.bottomBar,
    "--wrapt-input": colors.input,
    "--wrapt-text": colors.text,
    "--wrapt-text-muted": colors.muted,
    "--wrapt-text-faint": colors.faint,
    "--wrapt-border": colors.border,
    "--wrapt-border-strong": colors.borderStrong,
    "--wrapt-hover": colors.hover,
    "--wrapt-selected": colors.selected,
    "--wrapt-focus": colors.focus,
    "--color-accent": colors.accent,
    "--color-accent-contrast": colors.accentContrast,
    "--color-accent-light": `color-mix(in oklab, ${colors.accent} 80%, white)`,
    "--surface-base": colors.background,
    "--surface-raised": colors.surfaceRaised,
    "--surface-overlay": colors.surfaceOverlay,
    "--surface-sunken": colors.background,
    "--surface-hover": colors.hover,
    "--color-input": colors.input,
    "--glass-tint": `color-mix(in srgb, ${colors.topbar} 80%, transparent)`,
    "--color-ink-950": colors.background,
    "--color-ink-900": colors.surface,
    "--color-ink-875": colors.surfaceRaised,
    "--color-ink-850": colors.surfaceOverlay,
    "--color-ink-800": colors.hover,
    "--color-ink-750": colors.selected,
    "--color-ink-700": colors.input,
    "--color-ink-600": colors.borderStrong,
    "--color-line": colors.border,
    "--color-line-soft": colors.border,
    "--color-line-strong": colors.borderStrong,
    "--color-text": colors.text,
    "--color-muted": colors.muted,
    "--color-faint": colors.faint,
    "--color-ok": colors.success,
    "--color-good": colors.success,
    "--color-ok-soft": `color-mix(in oklab, ${colors.success} 15%, transparent)`,
    "--color-warn": colors.warning,
    "--color-warn-line": `color-mix(in oklab, ${colors.warning} 45%, transparent)`,
    "--color-warn-soft": `color-mix(in oklab, ${colors.warning} 15%, transparent)`,
    "--color-bad": colors.danger,
    "--color-bad-soft": `color-mix(in oklab, ${colors.danger} 15%, transparent)`,
    "--color-info": colors.info,
    "--focus-ring-color": colors.focus,
    "--icon-blue": colors.info,
    "--icon-blue-bright": colors.accent,
    "--icon-cyan": colors.info,
    "--icon-green": colors.success,
    "--icon-yellow": colors.warning,
    "--icon-orange": colors.warning,
    "--icon-red": colors.danger,
    "--icon-violet": colors.accent,
    "--icon-magenta": colors.accent,
    "--icon-text": colors.text,
    "--icon-soft": colors.muted,
    "--icon-muted": colors.faint,
    "--icon-line": colors.borderStrong,
    "--icon-surface": colors.surface,
    "--icon-surface-raised": colors.surfaceRaised,
    "--syntax-keyword": colors.accent,
    "--syntax-string": colors.success,
    "--syntax-title": colors.info,
    "--syntax-number": colors.warning,
    "--syntax-comment": colors.faint,
    "--syntax-type": colors.accent,
    "--syntax-variable": colors.text,
    "--syntax-meta": colors.danger,
    "--syntax-regexp": colors.info,
    "--orbit-minimap-project": colors.accent,
    "--orbit-minimap-usage": colors.success,
    "--orbit-minimap-frame": colors.borderStrong,
    "--orbit-minimap-tool": colors.info,
    "--orbit-canvas-dot": colors.border,
    "--ansi-black": colors.background,
    "--ansi-red": colors.danger,
    "--ansi-green": colors.success,
    "--ansi-yellow": colors.warning,
    "--ansi-blue": colors.info,
    "--ansi-magenta": colors.accent,
    "--ansi-cyan": colors.info,
    "--ansi-white": colors.text,
    "--ansi-bright-black": colors.faint,
    "--ansi-bright-red": colors.danger,
    "--ansi-bright-green": colors.success,
    "--ansi-bright-yellow": colors.warning,
    "--ansi-bright-blue": colors.info,
    "--ansi-bright-magenta": colors.accent,
    "--ansi-bright-cyan": colors.info,
    "--ansi-bright-white": colors.text,
    "--ansi-selection": `color-mix(in oklab, ${colors.info} 28%, transparent)`,
  };
}

const oklchPattern = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+(-?[\d.]+)\s*\)$/i;

function oklchToHex(lightness: number, chroma: number, hue: number): string {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const toHex = (channel: number) => {
    const srgb = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255).toString(16).padStart(2, "0");
  };
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

export function themeColorToHex(value: string): string | null {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  const match = oklchPattern.exec(value);
  if (!match) return null;
  const values = match.slice(1).map(Number);
  return values.every(Number.isFinite) ? oklchToHex(values[0]!, values[1]!, values[2]!) : null;
}

export function applyAppearanceTheme(theme: AppearanceTheme): void {
  const root = document.documentElement;
  root.dataset.themePreset = theme.preset;
  root.style.colorScheme = "dark";
  for (const [property, value] of Object.entries(appearanceThemeCssVariables(theme))) {
    root.style.setProperty(property, value);
  }
}
