import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: previews", () => {
  it("akzeptiert Preview Actions und permission-gebundene Targets", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            previews: validManifest.contributes.previews,
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [
            { permission: "preview.read", scope: { projects: ["current"] } },
            {
              permission: "preview.manage",
              scope: { projects: ["current"] },
            },
          ],
          contributes: {
            previews: [
              {
                id: "workbench.agent-tasks.preview.target.board",
                kind: "target",
                title: "Task Board",
                order: 100,
                provider: "workbench.agent-tasks.preview-provider.board",
                projectContext: true,
                sessionAccess: "manage",
                openModes: ["embedded", "external"],
                diagnostics: true,
                storageProfiles: true,
                visibleByDefault: true,
              },
            ],
          },
        }).success,
      ).toBe(true);
    });

  it("weist fehlende Preview Commands und fremde Target Provider ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            previews: [
              {
                ...validManifest.contributes.previews[0],
                commandId: "workbench.agent-tasks.command.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "preview.read" }],
          contributes: {
            previews: [
              {
                id: "workbench.agent-tasks.preview.target.board",
                kind: "target",
                title: "Task Board",
                order: 100,
                provider: "workbench.other.preview-provider.board",
                projectContext: true,
                sessionAccess: "read",
                openModes: ["embedded"],
                diagnostics: false,
                storageProfiles: false,
                visibleByDefault: true,
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt passende Preview Permissions und einen Entrypoint", () => {
      const previewTarget = {
        id: "workbench.agent-tasks.preview.target.board",
        kind: "target",
        title: "Task Board",
        order: 100,
        provider: "workbench.agent-tasks.preview-provider.board",
        projectContext: true,
        sessionAccess: "manage",
        openModes: ["embedded"],
        diagnostics: true,
        storageProfiles: true,
        visibleByDefault: true,
      } as const;
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "preview.manage" }],
          contributes: { previews: [previewTarget] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "preview.read" }],
          contributes: { previews: [previewTarget] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: {},
          permissions: [
            { permission: "preview.read" },
            { permission: "preview.manage" },
          ],
          contributes: { previews: [previewTarget] },
        }).success,
      ).toBe(false);
    });

  it("weist fremde Preview Icons, Context Keys und manifestweite IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            previews: [
              {
                ...validManifest.contributes.previews[0],
                icon: "workbench.other.icon.preview",
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
            previews: [
              {
                ...validManifest.contributes.previews[0],
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
            previews: [
              {
                ...validManifest.contributes.previews[0],
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
