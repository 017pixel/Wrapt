import { describe, expect, it } from "vitest";
import {
  appearanceThemeSchema,
  defaultAppearanceTheme,
  appearanceThemePresetIds,
  appearanceThemePresets,
} from "./appearance.js";

describe("Wrapt-Appearance-Vertrag", () => {
  it("liefert ein vollständiges Standard-Theme und Presets", () => {
    const theme = appearanceThemeSchema.parse({});

    expect(theme).toEqual(defaultAppearanceTheme);
    expect(defaultAppearanceTheme.colors.bottomBar).toBe(defaultAppearanceTheme.colors.topbar);
    expect(Object.keys(appearanceThemePresets)).toEqual(
      expect.arrayContaining(["wrapt-standard", "graphit", "sage"]),
    );
    expect(appearanceThemePresetIds).toEqual([
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
    ]);

    expect(appearanceThemeSchema.parse({ preset: "wrapt-standard", colors: appearanceThemePresets["wrapt-standard"] }).preset).toBe("wrapt-standard");
  });

  it("ergänzt alte Farbobjekte und akzeptiert sichere Hex- oder OKLCH-Werte", () => {
    const valid = appearanceThemeSchema.parse({
      preset: "custom",
      colors: {
        accent: "#3666c2",
        background: "#0a0a0a",
        sidebar: "#111111",
        topbar: "#111111",
        bottomBar: "#111111",
      },
    });
    expect(valid.colors.accent).toBe("#3666c2");
    expect(valid.colors.surfaceOverlay).toBe("#191919");

    const t3 = appearanceThemeSchema.parse({ preset: "t3-chat", colors: appearanceThemePresets["t3-chat"] });
    expect(t3.colors.accent).toMatch(/^oklch\(/);

    expect(() => appearanceThemeSchema.parse({
      preset: "custom",
      colors: { accent: "var(--accent)" },
    })).toThrow();
  });

  it("validiert alle sichtbaren Presets und lässt keinen Light-Modus zu", () => {
    for (const preset of appearanceThemePresetIds) {
      expect(appearanceThemeSchema.parse({ preset, colors: appearanceThemePresets[preset] }).preset).toBe(preset);
    }
    expect(() => appearanceThemeSchema.parse({ preset: "light" })).toThrow();
  });
});
