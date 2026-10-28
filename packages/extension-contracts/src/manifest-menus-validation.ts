import type { z } from "zod";
import type { ExtensionManifestInput } from "./manifest-base.js";
import { contributionBelongsToExtension } from "./ids.js";
import { contextKeyBelongsToExtension, contextExpressionKeys } from "./context-expressions.js";
import { contextMenuSurfaceBelongsToExtension } from "./context-menus.js";

export function validateMenus(manifest: ExtensionManifestInput, context: z.RefinementCtx): void {
  const commandIds = new Set((manifest.contributes.commands ?? []).map((command) => command.id));
  const pageIds = new Set((manifest.contributes.pages ?? []).map((page) => page.id));
    for (const [index, setting] of (
      manifest.contributes.settings ?? []
    ).entries()) {
      if (
        setting.icon !== undefined &&
        setting.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, setting.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Settings Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "settings", index, "icon"],
        });
      }
      if (setting.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "settings", index, "icon"],
        });
      }
      if (setting.kind === "page" && !pageIds.has(setting.pageId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine eigene Settings Page muss eine deklarierte Page Contribution referenzieren.",
          path: ["contributes", "settings", index, "pageId"],
        });
      }
    }

    for (const [index, shortcut] of (
      manifest.contributes.keyboardShortcuts ?? []
    ).entries()) {
      if (!commandIds.has(shortcut.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Ein Keyboard Shortcut muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "keyboardShortcuts", index, "commandId"],
        });
      }
      if (shortcut.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(shortcut.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "keyboardShortcuts", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.contextMenus ?? []
    ).entries()) {
      if (!commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Ein Context Menu Item muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "contextMenus", index, "commandId"],
        });
      }
      if (!contextMenuSurfaceBelongsToExtension(manifest.id, item.surface)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Extension Context-Menu-Surface muss zur deklarierenden Extension gehören.",
          path: ["contributes", "contextMenus", index, "surface"],
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
            "Eine Context Menu Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "contextMenus", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "contextMenus", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "contextMenus", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.statusBar ?? []
    ).entries()) {
      if (item.commandId !== undefined && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Status Bar Command-Aktion muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "statusBar", index, "commandId"],
        });
      }
      if (
        item.kind !== "action" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Status Bar Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "statusBar", index, "provider"],
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
            "Eine Status Bar Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "statusBar", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "statusBar", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "statusBar", index, "when"],
        });
      }
    }


}
