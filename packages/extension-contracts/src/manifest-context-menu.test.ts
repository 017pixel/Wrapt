import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: context-menu", () => {
  it("bindet Context Menu Items an tatsächliche Commands und Host-Surfaces", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            contextMenus: validManifest.contributes.contextMenus,
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            contextMenus: [
              {
                ...validManifest.contributes.contextMenus[0],
                commandId: "workbench.agent-tasks.command.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("begrenzt eigene Context-Menu-Surfaces und Context Keys auf den Extension-Namespace", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            contextMenus: [
              {
                ...validManifest.contributes.contextMenus[0],
                surface: "workbench.agent-tasks.context-menu.task",
                when: {
                  all: [
                    {
                      key: "workbench.agent-tasks.context.task-selected",
                      operator: "equals",
                      value: true,
                    },
                  ],
                },
              },
            ],
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            contextMenus: [
              {
                ...validManifest.contributes.contextMenus[0],
                surface: "workbench.other.context-menu.task",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            contextMenus: [
              {
                ...validManifest.contributes.contextMenus[0],
                when: {
                  all: [
                    {
                      key: "workbench.other.context.task-selected",
                      operator: "equals",
                      value: true,
                    },
                  ],
                },
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("weist fremde Icons und manifestweit doppelte Context Menu IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            contextMenus: [
              {
                ...validManifest.contributes.contextMenus[0],
                icon: "workbench.other.icon.task",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            contextMenus: [
              {
                ...validManifest.contributes.contextMenus[0],
                id: "workbench.agent-tasks.command.create",
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
            commands: validManifest.contributes.commands,
            contextMenus: [
              {
                ...validManifest.contributes.contextMenus[0],
                icon: "extension",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
