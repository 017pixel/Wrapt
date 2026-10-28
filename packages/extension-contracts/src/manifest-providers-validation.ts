import type { z } from "zod";
import type { ExtensionManifestInput } from "./manifest-base.js";
import { contributionBelongsToExtension } from "./ids.js";
import { contextKeyBelongsToExtension, contextExpressionKeys } from "./context-expressions.js";
import { agentSkillNameBelongsToExtension } from "./agent-skill-contributions.js";

export function validateProviders(manifest: ExtensionManifestInput, context: z.RefinementCtx): void {
  const commandIds = new Set((manifest.contributes.commands ?? []).map((command) => command.id));
    for (const [index, item] of (
      manifest.contributes.terminal ?? []
    ).entries()) {
      if (item.kind === "action" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Terminal Action muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "terminal", index, "commandId"],
        });
      }
      if (
        item.kind === "profile" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Terminal Profile Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "terminal", index, "provider"],
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
            "Eine Terminal Contribution Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "terminal", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "terminal", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "terminal", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.previews ?? []
    ).entries()) {
      if (item.kind === "action" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Preview Action muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "previews", index, "commandId"],
        });
      }
      if (
        item.kind === "target" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Preview Target Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "previews", index, "provider"],
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
            "Eine Preview Contribution Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "previews", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "previews", index, "icon"],
        });
      }
      if (item.when === undefined) continue;
      for (const contextKey of contextExpressionKeys(item.when)) {
        if (contextKeyBelongsToExtension(manifest.id, contextKey)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Ein Extension Context Key muss zur deklarierenden Extension gehören.",
          path: ["contributes", "previews", index, "when"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.agentTools ?? []
    ).entries()) {
      if (item.kind === "command" && !commandIds.has(item.commandId)) {
        context.addIssue({
          code: "custom",
          message:
            "Ein Command-basiertes Agent Tool muss eine deklarierte Command Contribution referenzieren.",
          path: ["contributes", "agentTools", index, "commandId"],
        });
      }
      if (
        item.kind === "provider" &&
        !contributionBelongsToExtension(manifest.id, item.provider)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Agent Tool Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "agentTools", index, "provider"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.agentSkills ?? []
    ).entries()) {
      if (agentSkillNameBelongsToExtension(manifest.id, item.name)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Ein Agent Skill Name muss mit dem normalisierten Extension-Namespace beginnen.",
        path: ["contributes", "agentSkills", index, "name"],
      });
    }

    for (const [index, item] of (
      manifest.contributes.backgroundServices ?? []
    ).entries()) {
      if (contributionBelongsToExtension(manifest.id, item.provider)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Background Service Provider ID muss zur deklarierenden Extension gehören.",
        path: ["contributes", "backgroundServices", index, "provider"],
      });
    }

    for (const [index, item] of (
      manifest.contributes.scheduledJobs ?? []
    ).entries()) {
      if (contributionBelongsToExtension(manifest.id, item.provider)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Scheduled Job Provider ID muss zur deklarierenden Extension gehören.",
        path: ["contributes", "scheduledJobs", index, "provider"],
      });
    }

    for (const [area, items] of [
      ["http", manifest.contributes.http ?? []],
      ["rpc", manifest.contributes.rpc ?? []],
    ] as const) {
      for (const [index, item] of items.entries()) {
        if (contributionBelongsToExtension(manifest.id, item.provider)) {
          continue;
        }
        context.addIssue({
          code: "custom",
          message:
            "Eine HTTP/RPC Provider ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", area, index, "provider"],
        });
      }
    }

    for (const [index, item] of (
      manifest.contributes.realtime ?? []
    ).entries()) {
      if (contributionBelongsToExtension(manifest.id, item.provider)) continue;
      context.addIssue({
        code: "custom",
        message:
          "Eine Realtime Provider ID muss zur deklarierenden Extension gehören.",
        path: ["contributes", "realtime", index, "provider"],
      });
    }

    for (const [index, item] of (
      manifest.contributes.notifications ?? []
    ).entries()) {
      if (
        item.icon !== "extension" &&
        !contributionBelongsToExtension(manifest.id, item.icon)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Eine Notification Icon ID muss zur deklarierenden Extension gehören.",
          path: ["contributes", "notifications", index, "icon"],
        });
      }
      if (item.icon === "extension" && manifest.icon === undefined) {
        context.addIssue({
          code: "custom",
          message:
            "Die Icon-Referenz extension benötigt ein lokales Manifest-Icon.",
          path: ["contributes", "notifications", index, "icon"],
        });
      }
      for (const [actionIndex, action] of (item.actions ?? []).entries()) {
        if (commandIds.has(action.commandId)) continue;
        context.addIssue({
          code: "custom",
          message:
            "Eine Notification Action muss eine deklarierte Command Contribution referenzieren.",
          path: [
            "contributes",
            "notifications",
            index,
            "actions",
            actionIndex,
            "commandId",
          ],
        });
      }
    }


}
