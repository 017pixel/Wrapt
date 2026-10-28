import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: dashboard", () => {
  it("akzeptiert Dashboard Provider und bindet Quick Actions an tatsächliche Commands", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            dashboard: validManifest.contributes.dashboard,
          },
        }).success,
      ).toBe(true);
    });

  it("weist fehlende Quick-Action-Commands und fremde Dashboard Provider ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            dashboard: [
              {
                ...validManifest.contributes.dashboard[1],
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
            ...validManifest.contributes,
            dashboard: [
              {
                ...validManifest.contributes.dashboard[0],
                provider: "workbench.other.dashboard-provider.open-count",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt für providerbasierte Dashboard Contributions einen Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: {},
          contributes: { dashboard: [validManifest.contributes.dashboard[0]] },
        }).success,
      ).toBe(false);
    });

  it("weist manifestweit doppelte Dashboard IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            dashboard: [
              {
                ...validManifest.contributes.dashboard[0],
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
