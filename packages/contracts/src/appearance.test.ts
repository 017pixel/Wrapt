import { describe, expect, it } from "vitest";
import {
  appearanceThemeSchema,
  defaultAppearanceTheme,
  appearanceThemePresets,
} from "./appearance.js";

describe("Wrapt-Appearance-Vertrag", () => {
  it("liefert ein vollständiges Standard-Theme und Presets", () => {
    const theme = appearanceThemeSchema.parse({ preset: "wrapt-standard" });

    expect(theme).toEqual(defaultAppearanceTheme);
    expect(Object.keys(appearanceThemePresets)).toEqual(
      expect.arrayContaining(["wrapt-standard", "graphit", "sage"]),
    );
  });

  it("erlaubt nur opake Hex-Farben für die Projektoberfläche", () => {
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

    expect(() => appearanceThemeSchema.parse({
      preset: "custom",
      colors: { accent: "var(--accent)" },
    })).toThrow();
  });
});
