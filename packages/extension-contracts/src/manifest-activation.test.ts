import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema, extensionPermissionsV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: activation", () => {
  it("akzeptiert ausschließlich strukturierte Permission Requests", () => {
      expect(extensionPermissionsV1Schema.safeParse([]).success).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [
            { permission: "files.read", scope: { projects: ["current"] } },
            {
              permission: "network.fetch",
              scope: { hosts: ["api.example.com"] },
            },
            { permission: "notifications.create" },
          ],
        }).success,
      ).toBe(true);
      expect(extensionPermissionsV1Schema.safeParse(["files.read"]).success).toBe(
        false,
      );
    });

  it("akzeptiert Activation Events im eigenen Contribution-Namespace", () => {
      const manifest = {
        ...validManifest,
        activationEvents: [
          "onStartup",
          "onProject",
          "onEvent:project.opened",
          "onCommand:workbench.agent-tasks.command.create",
          "onRoute:workbench.agent-tasks.route.main",
        ],
      };
      expect(extensionManifestV1Schema.safeParse(manifest).success).toBe(true);
    });

  it("weist fremde Contribution-Namespaces und doppelte Events ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: ["onCommand:workbench.other.command.create"],
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: ["onEvent:workbench.other.task.created"],
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: ["onStartup", "onStartup"],
        }).success,
      ).toBe(false);
    });
});
