import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: files", () => {
  it("akzeptiert File Opener und permission-gebundene Viewer", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            files: validManifest.contributes.files,
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "files.read" }],
          contributes: {
            files: [
              {
                id: "workbench.agent-tasks.file.viewer",
                kind: "viewer",
                title: "Agent Task Vorschau",
                icon: "workbench.agent-tasks.icon.tasks",
                matcher: validManifest.contributes.files[0]!.matcher,
                priority: 80,
                provider: "workbench.agent-tasks.file-provider.viewer",
                surfaces: ["detail", "quick-look"],
                contentMode: "text",
              },
            ],
          },
        }).success,
      ).toBe(true);
    });

  it("weist fehlende File Commands und fremde Viewer Provider ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            files: [
              {
                ...validManifest.contributes.files[0],
                commandId: "workbench.agent-tasks.command.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "files.read" }],
          contributes: {
            files: [
              {
                id: "workbench.agent-tasks.file.viewer",
                kind: "viewer",
                title: "Agent Task Vorschau",
                matcher: validManifest.contributes.files[0]!.matcher,
                priority: 80,
                provider: "workbench.other.file-provider.viewer",
                surfaces: ["quick-look"],
                contentMode: "text",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("weist fremde File Icons, Context Keys und manifestweite IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            files: [
              {
                ...validManifest.contributes.files[0],
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
            files: [
              {
                ...validManifest.contributes.files[0],
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
            files: [
              {
                ...validManifest.contributes.files[0],
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt UI-Entrypoint und files.read für File Viewer", () => {
      const viewer = {
        id: "workbench.agent-tasks.file.viewer",
        kind: "viewer",
        title: "Agent Task Vorschau",
        matcher: validManifest.contributes.files[0]!.matcher,
        priority: 80,
        provider: "workbench.agent-tasks.file-provider.viewer",
        surfaces: ["detail"],
        contentMode: "text",
      } as const;
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: { server: "./dist/server.mjs" },
          permissions: [{ permission: "files.read" }],
          contributes: { files: [viewer] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [],
          contributes: { files: [viewer] },
        }).success,
      ).toBe(false);
    });
});
