import { describe, expect, it } from "vitest";
import { extensionManifestV1Schema } from "./manifest.js";
import { validManifest } from "./manifest.fixture.js";

const notificationSource = {
    id: "workbench.agent-tasks.notification.source",
    title: "Agent Tasks",
    description: "Benachrichtigungen zu Agent-Aufgaben.",
    icon: "extension",
    categories: [
      {
        id: "workbench.agent-tasks.notification-category.tasks",
        title: "Agent-Aufgaben",
      },
    ],
    actions: [
      {
        id: "workbench.agent-tasks.notification-action.open",
        title: "Aufgabe öffnen",
        commandId: "workbench.agent-tasks.command.create",
      },
    ],
    retention: "until-resolved",
    deduplication: {
      mode: "keyed",
      keyMaxLength: 128,
      behavior: "replace-active",
    },
  } as const;

describe("Extension Manifest: notifications", () => {
  it("akzeptiert permission-gebundene Notification Sources", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "notifications.create" }],
          contributes: {
            commands: validManifest.contributes.commands,
            notifications: [notificationSource],
          },
        }).success,
      ).toBe(true);
    });

  it("verlangt für Notification Sources Permission, Commands und eigene Icons", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [],
          contributes: { notifications: [notificationSource] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "notifications.create" }],
          contributes: { notifications: [notificationSource] },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "notifications.create" }],
          contributes: {
            commands: validManifest.contributes.commands,
            notifications: [
              {
                ...notificationSource,
                icon: "workbench.other.icon.notifications",
              },
            ],
          },
        }).success,
      ).toBe(false);
    });

  it("verlangt ein Manifest-Icon für die lokale Notification Icon-Referenz", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          icon: undefined,
          permissions: [{ permission: "notifications.create" }],
          contributes: {
            commands: validManifest.contributes.commands,
            notifications: [notificationSource],
          },
        }).success,
      ).toBe(false);
    });

  it("weist fremde und manifestweit doppelte Notification IDs ab", () => {
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "notifications.create" }],
          contributes: {
            commands: validManifest.contributes.commands,
            notifications: [
              {
                ...notificationSource,
                categories: [
                  {
                    ...notificationSource.categories[0],
                    id: "workbench.other.notification-category.tasks",
                  },
                ],
              },
            ],
          },
        }).success,
      ).toBe(false);
      expect(
        extensionManifestV1Schema.safeParse({
          ...validManifest,
          permissions: [{ permission: "notifications.create" }],
          contributes: {
            commands: validManifest.contributes.commands,
            notifications: [
              {
                ...notificationSource,
                actions: [
                  {
                    ...notificationSource.actions[0],
                    id: notificationSource.categories[0].id,
                  },
                ],
              },
            ],
          },
        }).success,
      ).toBe(false);
    });
});
