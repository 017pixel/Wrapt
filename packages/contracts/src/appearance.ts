import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Farben müssen opake sechsstellige Hex-RGB-Werte sein.").transform((value) => value.toLowerCase());

export const appearanceThemePresetSchema = z.enum(["wrapt-standard", "graphit", "sage", "custom"]);
export type AppearanceThemePreset = z.infer<typeof appearanceThemePresetSchema>;

export const appearanceColorsSchema = z.strictObject({
  accent: hexColorSchema,
  background: hexColorSchema,
  sidebar: hexColorSchema,
  topbar: hexColorSchema,
  bottomBar: hexColorSchema,
});
export type AppearanceColors = z.infer<typeof appearanceColorsSchema>;

export const appearanceThemePresets = {
  "wrapt-standard": {
    accent: "#3666c2",
    background: "#0a0a0a",
    sidebar: "#111111",
    topbar: "#0a0a0a",
    bottomBar: "#111111",
  },
  graphit: {
    accent: "#8b9aae",
    background: "#101112",
    sidebar: "#181a1c",
    topbar: "#101112",
    bottomBar: "#181a1c",
  },
  sage: {
    accent: "#6f9f86",
    background: "#0b100d",
    sidebar: "#121a15",
    topbar: "#0b100d",
    bottomBar: "#121a15",
  },
} as const;

export const defaultAppearanceTheme = {
  preset: "wrapt-standard" as const,
  colors: appearanceThemePresets["wrapt-standard"],
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
