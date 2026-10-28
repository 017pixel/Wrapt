import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: settings", () => {
  it("akzeptiert hostgerenderte Settings ohne Extension-Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: {},
          contributes: { settings: validManifest.contributes.settings },
        }).success,
      ).toBe(true);
    });

  it("bindet eine eigene Settings Page an eine tatsächlich deklarierte Page", () => {
      const settingsPage = {
        id: "workbench.agent-tasks.settings.advanced",
        kind: "page",
        title: "Erweitert",
        order: 200,
        scope: "server",
        pageId: "workbench.agent-tasks.page.main",
      } as const;
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            pages: validManifest.contributes.pages,
            settings: [settingsPage],
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            pages: validManifest.contributes.pages,
            settings: [
              {
                ...settingsPage,
                pageId: "workbench.agent-tasks.page.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("weist fremde Settings IDs, Field IDs und Icons ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            settings: [
              {
                ...validManifest.contributes.settings[0],
                id: "workbench.other.settings.general",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            settings: [
              {
                ...validManifest.contributes.settings[0],
                fields: [
                  {
                    ...validManifest.contributes.settings[0]!.fields[0]!,
                    id: "workbench.other.setting.notifications",
                  },
                ],
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            settings: [
              {
                ...validManifest.contributes.settings[0],
                icon: "workbench.other.icon.settings",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt für das Extension-Icon in Settings ein lokales Manifest-Icon", () => {
      const manifestWithoutIcon: Partial<typeof validManifest> = {
        ...validManifest,
      };
      delete manifestWithoutIcon.icon;
      expect(
        extensionManifestV1Schema.safeParse({
          ...manifestWithoutIcon,
          contributes: {
            settings: [
              {
                ...validManifest.contributes.settings[0],
                icon: "extension",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("weist manifestweit doppelte Setting Field IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            settings: [
              {
                ...validManifest.contributes.settings[0],
                fields: [
                  {
                    ...validManifest.contributes.settings[0]!.fields[0]!,
                    id: "workbench.agent-tasks.command.create",
                  },
                ],
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
