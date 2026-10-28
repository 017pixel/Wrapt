import type { z } from "zod";
import type { ExtensionManifestInput } from "./manifest-base.js";
import { contributionBelongsToExtension } from "./ids.js";

export function validateNavigation(manifest: ExtensionManifestInput, context: z.RefinementCtx): void {
  const commandIds = new Set((manifest.contributes.commands ?? []).map((command) => command.id));
  const pageIds = new Set((manifest.contributes.pages ?? []).map((page) => page.id));
  const routeIds = new Set((manifest.contributes.routes ?? []).map((route) => route.id));
    for (const [index, route] of (
      manifest.contributes.routes ?? []
    ).entries()) {
      if (pageIds.has(route.pageId)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Route muss eine deklarierte Page Contribution derselben Extension referenzieren.",
        path: ["contributes", "routes", index, "pageId"],
      });
    }

    for (const [index, item] of (
      manifest.contributes.navigation ?? []
    ).entries()) {
      if (!routeIds.has(item.routeId)) {
        context.addIssue({
          code: "custom",
          message:
            "Navigation muss eine deklarierte Route Contribution derselben Extension referenzieren.",
          path: ["contributes", "navigation", index, "routeId"],
        });
      }
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Navigation Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "navigation", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "navigation", index, "icon"],
        });
      }
      if (
        item.badgeProvider !== undefined &&
        !contributionBelongsToExtension(manifest.id, item.badgeProvider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Navigation Badge Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "navigation", index, "badgeProvider"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.dashboard ?? []
    ).entries()) {
      if (
        item.icon !== undefined &&
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Dashboard Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "dashboard", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "dashboard", index, "icon"],
        });
      }
      if (item.kind === "quick-action") {
        if (!commandIds.has(item.commandId)) {
          context.addIssue({
            code: "custom",
            message:
              "Eine Dashboard Quick Action muss eine deklarierte Command Contribution referenzieren.",
            path: ["contributes", "dashboard", index, "commandId"],
          });
        }
        continue;
      }
      if (!contributionBelongsToExtension(manifest.id, item.provider)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Dashboard Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "dashboard", index, "provider"],
        });
      }
    }


}
