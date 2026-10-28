import type { z } from "zod";
import type { ExtensionManifestInput } from "./manifest-base.js";
import { contributionBelongsToExtension } from "./ids.js";

export function validateIdentities(manifest: ExtensionManifestInput, context: z.RefinementCtx): void {
    const declaredContributions = [
      ...(manifest.contributes.commands ?? []).map((command, index) => ({
        id: command.id,
        path: ["contributes", "commands", index, "id"] as const,
      })),
      ...(manifest.contributes.pages ?? []).map((page, index) => ({
        id: page.id,
        path: ["contributes", "pages", index, "id"] as const,
      })),
      ...(manifest.contributes.routes ?? []).map((route, index) => ({
        id: route.id,
        path: ["contributes", "routes", index, "id"] as const,
      })),
      ...(manifest.contributes.navigation ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "navigation", index, "id"] as const,
      })),
      ...(manifest.contributes.dashboard ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "dashboard", index, "id"] as const,
      })),
      ...(manifest.contributes.settings ?? []).flatMap((setting, index) => [
        {
          id: setting.id,
          path: ["contributes", "settings", index, "id"] as const,
        },
        ...(setting.kind === "schema"
          ? setting.fields.map((field, fieldIndex) => ({
              id: field.id,
              path: [
                "contributes",
                "settings",
                index,
                "fields",
                fieldIndex,
                "id",
              ] as const,
            }))
          : []),
      ]),
      ...(manifest.contributes.keyboardShortcuts ?? []).map(
        (shortcut, index) => ({
          id: shortcut.id,
          path: ["contributes", "keyboardShortcuts", index, "id"] as const,
        }),
      ),
      ...(manifest.contributes.contextMenus ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "contextMenus", index, "id"] as const,
      })),
      ...(manifest.contributes.statusBar ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "statusBar", index, "id"] as const,
      })),
      ...(manifest.contributes.topbar ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "topbar", index, "id"] as const,
      })),
      ...(manifest.contributes.files ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "files", index, "id"] as const,
      })),
      ...(manifest.contributes.terminal ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "terminal", index, "id"] as const,
      })),
      ...(manifest.contributes.previews ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "previews", index, "id"] as const,
      })),
      ...(manifest.contributes.agentTools ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "agentTools", index, "id"] as const,
      })),
      ...(manifest.contributes.agentSkills ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "agentSkills", index, "id"] as const,
      })),
      ...(manifest.contributes.backgroundServices ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "backgroundServices", index, "id"] as const,
      })),
      ...(manifest.contributes.scheduledJobs ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "scheduledJobs", index, "id"] as const,
      })),
      ...(manifest.contributes.http ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "http", index, "id"] as const,
      })),
      ...(manifest.contributes.rpc ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "rpc", index, "id"] as const,
      })),
      ...(manifest.contributes.realtime ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "realtime", index, "id"] as const,
      })),
      ...(manifest.contributes.notifications ?? []).flatMap((item, index) => [
        {
          id: item.id,
          path: ["contributes", "notifications", index, "id"] as const,
        },
        ...item.categories.map((category, categoryIndex) => ({
          id: category.id,
          path: [
            "contributes",
            "notifications",
            index,
            "categories",
            categoryIndex,
            "id",
          ] as const,
        })),
        ...(item.actions ?? []).map((action, actionIndex) => ({
          id: action.id,
          path: [
            "contributes",
            "notifications",
            index,
            "actions",
            actionIndex,
            "id",
          ] as const,
        })),
      ]),
      ...(manifest.contributes.themes ?? []).map((item, index) => ({
        id: item.id,
        path: ["contributes", "themes", index, "id"] as const,
      })),
    ];
    const seenContributionIds = new Set<string>();
    for (const contribution of declaredContributions) {
      if (!contributionBelongsToExtension(manifest.id, contribution.id)) {
        context.addIssue({
          code: "custom",
          message:
            "Contribution IDs müssen zur deklarierenden Extension gehören.",
          path: [...contribution.path],
        });
      }
      if (seenContributionIds.has(contribution.id)) {
        context.addIssue({
          code: "custom",
          message: "Contribution IDs müssen manifestweit eindeutig sein.",
          path: [...contribution.path],
        });
      }
      seenContributionIds.add(contribution.id);
    }


}
