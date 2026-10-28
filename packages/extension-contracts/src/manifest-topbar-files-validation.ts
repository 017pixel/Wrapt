import type { z } from "zod";
import type { ExtensionManifestInput } from "./manifest-base.js";
import { contributionBelongsToExtension } from "./ids.js";
import { contextKeyBelongsToExtension, contextExpressionKeys } from "./context-expressions.js";

export function validateTopbarFiles(manifest: ExtensionManifestInput, context: z.RefinementCtx): void {
  const commandIds = new Set((manifest.contributes.commands ?? []).map((command) => command.id));
    for (const [index, item] of (manifest.contributes.topbar ?? []).entries()) {
      if (!commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Contribution muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "topbar", index, "commandId"],
        });
      }
      const targetRoute = (manifest.contributes.routes ?? []).find(
        (route) => route.id === item.routeId,
      );
      if (targetRoute === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Contribution muss eine deklarierte Route Contribution referenzieren.",
          path: ["contributes", "topbar", index, "routeId"],
        });
      } else if (!targetRoute.topbar) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Contribution kann nur eine Route mit aktivierter Topbar referenzieren.",
          path: ["contributes", "topbar", index, "routeId"],
        });
      }
      if (
        item.kind === "selector" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Topbar Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "topbar", index, "provider"],
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
            "Eine Topbar Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "topbar", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "topbar", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "topbar", index, "when"],
        });
      }
    }

    for (const [index, item] of (manifest.contributes.files ?? []).entries()) {
      if (item.kind === "opener" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Ein File Opener muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "files", index, "commandId"],
        });
      }
      if (
        item.kind === "viewer" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine File Viewer Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "files", index, "provider"],
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
            "Eine File Contribution Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "files", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "files", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "files", index, "when"],
        });
      }
    }


}
