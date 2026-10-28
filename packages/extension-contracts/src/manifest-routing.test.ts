import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: routing", () => {
  it("akzeptiert Pages, Routes und onRoute mit tatsächlichen Manifestzielen", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: ["onRoute:workbench.agent-tasks.route.main"],
        }).success,
      ).toBe(true);
    });

  it("weist fehlende Page- und onRoute-Ziele ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            routes: [
              {
                ...validManifest.contributes.routes[0],
                pageId: "workbench.agent-tasks.page.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          activationEvents: ["onRoute:workbench.agent-tasks.route.missing"],
        }).success,
      ).toBe(false);
    });

  it("weist fremde und manifestweit doppelte Contribution IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            pages: [{ id: "workbench.other.page.main", title: "Fremde Page" }],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            ...validManifest.contributes,
            pages: [
              {
                id: "workbench.agent-tasks.command.create",
                title: "Doppelte ID",
              },
            ],
            routes: [
              {
                ...validManifest.contributes.routes[0],
                pageId: "workbench.agent-tasks.command.create",
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
            navigation: [
              {
                ...validManifest.contributes.navigation[0],
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt für Pages einen UI-Entrypoint", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          entrypoints: { server: "./dist/server.js" },
          contributes: { pages: validManifest.contributes.pages },
        }).success,
      ).toBe(false);
    });
});
