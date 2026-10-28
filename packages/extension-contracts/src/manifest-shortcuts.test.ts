import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: shortcuts", () => {
  it("begrenzt Extension Context Keys auf den eigenen Namespace", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            keyboardShortcuts: [
              {
                ...validManifest.contributes.keyboardShortcuts[0],
                when: {
                  all: [
                    {
                      key: "workbench.agent-tasks.context.has-selection",
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
            keyboardShortcuts: [
              {
                ...validManifest.contributes.keyboardShortcuts[0],
                when: {
                  all: [
                    {
                      key: "workbench.other.context.has-selection",
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
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            keyboardShortcuts: [
              {
                ...validManifest.contributes.keyboardShortcuts[0],
                when: {
                  all: [
                    {
                      key: "host.unknown.focused",
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

  it("weist fremde und manifestweit doppelte Shortcut IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            keyboardShortcuts: [
              {
                ...validManifest.contributes.keyboardShortcuts[0],
                id: "workbench.other.shortcut.create",
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
            keyboardShortcuts: [
              {
                ...validManifest.contributes.keyboardShortcuts[0],
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
