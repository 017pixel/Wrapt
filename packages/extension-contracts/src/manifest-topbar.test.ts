import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";



describe("Extension Manifest: topbar", () => {
  it("akzeptiert routegebundene Topbar-Aktionen und Selector Provider", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            pages: validManifest.contributes.pages,
            routes: validManifest.contributes.routes,
            topbar: validManifest.contributes.topbar,
          },
        }).success,
      ).toBe(true);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            pages: validManifest.contributes.pages,
            routes: validManifest.contributes.routes,
            topbar: [
              {
                ...validManifest.contributes.topbar[0],
                id: "workbench.agent-tasks.topbar.project",
                kind: "selector",
                title: "Projekt",
                provider: "workbench.agent-tasks.topbar-provider.projects",
              },
            ],
          },
        }).success,
      ).toBe(true);
    });

  it("weist fehlende Commands und Routes für Topbar Contributions ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            pages: validManifest.contributes.pages,
            routes: validManifest.contributes.routes,
            topbar: [
              {
                ...validManifest.contributes.topbar[0],
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
            topbar: [
              {
                ...validManifest.contributes.topbar[0],
                routeId: "workbench.agent-tasks.route.missing",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("weist Topbar Contributions auf Routes ohne Topbar ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            pages: validManifest.contributes.pages,
            routes: [
              {
                ...validManifest.contributes.routes[0],
                topbar: false,
              },
            ],
            topbar: validManifest.contributes.topbar,
          },
        }).success,
      ).toBe(false);
    });

  it("weist fremde Topbar Provider, Icons und Context Keys ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          contributes: {
            commands: validManifest.contributes.commands,
            pages: validManifest.contributes.pages,
            routes: validManifest.contributes.routes,
            topbar: [
              {
                ...validManifest.contributes.topbar[0],
                kind: "selector",
                title: "Projekt",
                provider: "workbench.other.topbar-provider.projects",
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
            pages: validManifest.contributes.pages,
            routes: validManifest.contributes.routes,
            topbar: [
              {
                ...validManifest.contributes.topbar[0],
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
            pages: validManifest.contributes.pages,
            routes: validManifest.contributes.routes,
            topbar: [
              {
                ...validManifest.contributes.topbar[0],
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
    });

  it("weist Topbar Icon- und manifestweite ID-Verstöße ab", () => {
      const manifestWithoutIcon: Partial<typeof validManifest> = {
        ...validManifest,
      };
      delete manifestWithoutIcon.icon;
      expect(
        extensionManifestV1Schema.safeParse({
          ...manifestWithoutIcon,
          contributes: {
            commands: validManifest.contributes.commands,
            pages: validManifest.contributes.pages,
            routes: validManifest.contributes.routes,
            topbar: [
              {
                ...validManifest.contributes.topbar[0],
                icon: "extension",
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
            pages: validManifest.contributes.pages,
            routes: validManifest.contributes.routes,
            topbar: [
              {
                ...validManifest.contributes.topbar[0],
                id: "workbench.agent-tasks.command.create",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
