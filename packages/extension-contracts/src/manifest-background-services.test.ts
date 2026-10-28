import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";

const backgroundService = {
    id: "workbench.agent-tasks.background-service.sync",
    title: "Agent Tasks synchronisieren",
    description: "Synchronisiert Agent Tasks im Hintergrund.",
    provider: "workbench.agent-tasks.background-service-provider.sync",
    enabledByDefault: true,
    restart: {
      mode: "on-failure",
      maxAttempts: 3,
      windowMilliseconds: 300_000,
      backoffMilliseconds: 1_000,
    },
    health: {
      intervalMilliseconds: 30_000,
      timeoutMilliseconds: 5_000,
      failureThreshold: 3,
    },
    shutdownTimeoutMilliseconds: 10_000,
  } as const;

describe("Extension Manifest: background-services", () => {
  it("akzeptiert hostverwaltete Background Services", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: { backgroundServices: [backgroundService] },
        }).success,
      ).toBe(true);
    });

  it("verlangt für Background Services eigene Provider und Server-Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            backgroundServices: [
              {
                ...backgroundService,
                provider: "workbench.other.background-service-provider.sync",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: { ui: "./dist/ui.js" },
          contributes: { backgroundServices: [backgroundService] },
        }).success,
      ).toBe(false);
    });

  it("weist manifestweit doppelte Background Service IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            backgroundServices: [
              {
                ...backgroundService,
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
