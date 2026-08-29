import { z } from "zod";
import {
  appearanceThemePresetIds,
  appearanceThemePresets,
  type AppearancePresetColors,
  type AppearanceThemePresetId,
} from "./appearance-palettes.js";

export { appearanceThemeCatalog, appearanceThemePresetIds, appearanceThemePresets } from "./appearance-palettes.js";
export type { AppearanceThemePresetId } from "./appearance-palettes.js";

const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const oklchColorPattern = /^oklch\(\s*(?:0|1|0?\.\d+)\s+(?:0|0?\.\d+)\s+-?\d+(?:\.\d+)?\s*\)$/i;

const themeColorSchema = z
  .string()
  .trim()
  .refine((value) => hexColorPattern.test(value) || oklchColorPattern.test(value), "Theme-Farben müssen opake Hex- oder OKLCH-Werte sein.")
  .transform((value) => hexColorPattern.test(value) ? value.toLowerCase() : value);

const defaultColors: AppearancePresetColors = appearanceThemePresets["t3-code"];

export const appearanceThemePresetSchema = z.enum([
  "t3-code",
  "t3-chat",
  "grove",
  "ocean",
  "ember",
  "iris",
  "dark-modern",
  "monokai",
  "carbon",
  "signal",
  "wrapt-standard",
  "graphit",
  "sage",
  "custom",
]);
export type AppearanceThemePreset = z.infer<typeof appearanceThemePresetSchema>;

export const appearanceColorsSchema = z.strictObject({
  accent: themeColorSchema.default(defaultColors.accent),
  accentContrast: themeColorSchema.default(defaultColors.accentContrast),
  background: themeColorSchema.default(defaultColors.background),
  surface: themeColorSchema.default(defaultColors.surface),
  surfaceRaised: themeColorSchema.default(defaultColors.surfaceRaised),
  surfaceOverlay: themeColorSchema.default(defaultColors.surfaceOverlay),
  sidebar: themeColorSchema.default(defaultColors.sidebar),
  topbar: themeColorSchema.default(defaultColors.topbar),
  bottomBar: themeColorSchema.default(defaultColors.bottomBar),
  text: themeColorSchema.default(defaultColors.text),
  muted: themeColorSchema.default(defaultColors.muted),
  faint: themeColorSchema.default(defaultColors.faint),
  border: themeColorSchema.default(defaultColors.border),
  borderStrong: themeColorSchema.default(defaultColors.borderStrong),
  input: themeColorSchema.default(defaultColors.input),
  hover: themeColorSchema.default(defaultColors.hover),
  selected: themeColorSchema.default(defaultColors.selected),
  focus: themeColorSchema.default(defaultColors.focus),
  success: themeColorSchema.default(defaultColors.success),
  warning: themeColorSchema.default(defaultColors.warning),
  danger: themeColorSchema.default(defaultColors.danger),
  info: themeColorSchema.default(defaultColors.info),
});
export type AppearanceColors = z.infer<typeof appearanceColorsSchema>;

export const defaultAppearanceTheme = {
  preset: "t3-code" as const,
  colors: defaultColors,
};

export const appearanceThemeSchema = z.strictObject({
  preset: appearanceThemePresetSchema.default(defaultAppearanceTheme.preset),
  colors: appearanceColorsSchema.default(defaultAppearanceTheme.colors),
});
export type AppearanceTheme = z.infer<typeof appearanceThemeSchema>;

export const appearanceResponseSchema = z.strictObject({
  theme: appearanceThemeSchema,
  source: z.enum(["project", "default"]),
});
export type AppearanceResponse = z.infer<typeof appearanceResponseSchema>;

export function isVisibleAppearancePreset(value: AppearanceThemePreset): value is AppearanceThemePresetId {
  return (appearanceThemePresetIds as readonly string[]).includes(value);
}
