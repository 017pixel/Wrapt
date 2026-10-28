import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: dependencies", () => {
  it("akzeptiert optionale Dependency- und Conflict-Verträge", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          extensionDependencies: { "workbench.projects": "^1.0.0" },
          optionalExtensionDependencies: { "workbench.git": "^1.0.0" },
          extensionConflicts: [
            { id: "workbench.legacy-agent-tasks", range: "<2.0.0" },
          ],
        }).success,
      ).toBe(true);
    });

  it("weist Selbstabhängigkeiten und Selbstkonflikte ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          extensionDependencies: { "workbench.agent-tasks": "^1.0.0" },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          optionalExtensionDependencies: { "workbench.agent-tasks": "^1.0.0" },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          extensionConflicts: [{ id: "workbench.agent-tasks" }],
        }).success,
      ).toBe(false);
    });

  it("weist Überschneidungen zwischen Dependency-Bereichen ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          extensionDependencies: { "workbench.projects": "^1.0.0" },
          optionalExtensionDependencies: { "workbench.projects": "^1.0.0" },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          extensionDependencies: { "workbench.projects": "^1.0.0" },
          optionalExtensionDependencies: {},
          extensionConflicts: [{ id: "workbench.projects" }],
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          extensionDependencies: {},
          optionalExtensionDependencies: { "workbench.notifications": "^1.0.0" },
          extensionConflicts: [
            { id: "workbench.notifications", range: "^1.0.0" },
          ],
        }).success,
      ).toBe(false);
    });
});
