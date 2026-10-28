import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: navigation", () => {
  it("akzeptiert Navigation mit tatsächlichem Route-Ziel und sicherem Extension-Icon", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            navigation: [
              {
                ...validManifest.contributes.navigation[0],
                icon: "extension",
                visibleByDefault: false,
              },
            ],
          },
        }).success,
      ).toBe(true);
    });

  it("weist fehlende Navigation-Routen und fremde Runtime-Referenzen ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            navigation: [
              {
                ...validManifest.contributes.navigation[0],
                routeId: "workbench.agent-tasks.route.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            navigation: [
              {
                ...validManifest.contributes.navigation[0],
                icon: "workbench.other.icon.main",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            navigation: [
              {
                ...validManifest.contributes.navigation[0],
                badgeProvider: "workbench.other.badge.open-tasks",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt für die Extension-Icon-Referenz ein lokales Manifest-Icon", () => {
      const manifestWithoutIcon: Partial<typeof validManifest> = {
        ...validManifest,
      };
      delete manifestWithoutIcon.icon;
      expect(
        extensionManifestV1Schema.safeParse({
          ...manifestWithoutIcon,
          contributes: {
            ...validManifest.contributes,
            navigation: [
              {
                ...validManifest.contributes.navigation[0],
                icon: "extension",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("weist fremde Dashboard Icons und eine unbelegte Extension-Icon-Referenz ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            dashboard: [
              {
                ...validManifest.contributes.dashboard[0],
                icon: "workbench.other.icon.tasks",
              },
            ],
          },
        }).success,
      ).toBe(false);

      const manifestWithoutIcon: Partial<typeof validManifest> = {
        ...validManifest,
      };
      delete manifestWithoutIcon.icon;
      expect(
        extensionManifestV1Schema.safeParse({
          ...manifestWithoutIcon,
          contributes: {
            ...validManifest.contributes,
            dashboard: [
              {
                ...validManifest.contributes.dashboard[0],
                icon: "extension",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
