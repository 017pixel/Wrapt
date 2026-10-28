import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: statusbar", () => {
  it("akzeptiert providerbasierte Status Bar Items und Command-Aktionen", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            statusBar: validManifest.contributes.statusBar,
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            statusBar: [
              {
                id: "workbench.agent-tasks.status-bar.create",
                kind: "action",
                title: "Aufgabe erstellen",
                alignment: "right",
                order: 110,
                priority: 40,
                compact: "hide",
                commandId: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(true);
    });

  it("weist fehlende Commands und fremde Status Bar Provider ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            statusBar: [
              {
                ...validManifest.contributes.statusBar[0],
                commandId: "workbench.agent-tasks.command.missing",
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
            statusBar: [
              {
                ...validManifest.contributes.statusBar[0],
                provider: "workbench.other.status-provider.open-count",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("weist fremde Status Bar Icons, Context Keys und manifestweite IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            statusBar: [
              {
                ...validManifest.contributes.statusBar[0],
                icon: "workbench.other.icon.tasks",
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
            statusBar: [
              {
                ...validManifest.contributes.statusBar[0],
                when: {
                  all: [
                    {
                      key: "workbench.other.context.visible",
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
            statusBar: [
              {
                ...validManifest.contributes.statusBar[0],
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt für providerbasierte Status Bar Items einen Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: {},
          contributes: {
            statusBar: [
              {
                ...validManifest.contributes.statusBar[0],
                commandId: undefined,
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
