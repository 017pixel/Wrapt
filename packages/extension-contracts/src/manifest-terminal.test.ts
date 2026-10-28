import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: terminal", () => {
  it("akzeptiert Terminal Actions und permission-gebundene Profile", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            terminal: validManifest.contributes.terminal,
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [
            {
              permission: "terminal.create",
              scope: { projects: ["current"] },
            },
          ],
          contributes: {
            terminal: [
              {
                id: "workbench.agent-tasks.terminal.profile.runner",
                kind: "profile",
                title: "Task Runner",
                order: 100,
                provider: "workbench.agent-tasks.terminal-provider.runner",
                projectContext: true,
                supportsSplit: true,
                visibleByDefault: true,
              },
            ],
          },
        }).success,
      ).toBe(true);
    });

  it("weist fehlende Terminal Commands und fremde Profile Provider ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            terminal: [
              {
                ...validManifest.contributes.terminal[0],
                commandId: "workbench.agent-tasks.command.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "terminal.create" }],
          contributes: {
            terminal: [
              {
                id: "workbench.agent-tasks.terminal.profile.runner",
                kind: "profile",
                title: "Task Runner",
                order: 100,
                provider: "workbench.other.terminal-provider.runner",
                projectContext: true,
                supportsSplit: true,
                visibleByDefault: true,
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt terminal.create und einen Entrypoint für Terminal Profile", () => {
      const terminalProfile = {
        id: "workbench.agent-tasks.terminal.profile.runner",
        kind: "profile",
        title: "Task Runner",
        order: 100,
        provider: "workbench.agent-tasks.terminal-provider.runner",
        projectContext: true,
        supportsSplit: true,
        visibleByDefault: true,
      } as const;
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [],
          contributes: { terminal: [terminalProfile] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: {},
          permissions: [{ permission: "terminal.create" }],
          contributes: { terminal: [terminalProfile] },
        }).success,
      ).toBe(false);
    });

  it("weist fremde Terminal Icons, Context Keys und manifestweite IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            terminal: [
              {
                ...validManifest.contributes.terminal[0],
                icon: "workbench.other.icon.terminal",
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
            terminal: [
              {
                ...validManifest.contributes.terminal[0],
                when: {
                  all: [
                    {
                      key: "workbench.other.context.visible",
                      operator: "exists",
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
            terminal: [
              {
                ...validManifest.contributes.terminal[0],
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
