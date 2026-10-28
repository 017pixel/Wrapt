import type { z } from "zod";
import type { ExtensionManifestInput } from "./manifest-base.js";

export function validateRequirements(manifest: ExtensionManifestInput, context: z.RefinementCtx): void {
    if (
      manifest.contributes.commands !== undefined &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Command Contributions benötigen einen UI- oder Server-Entrypoint für ihren Handler.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.pages !== undefined &&
      manifest.entrypoints.ui === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Page Contributions benötigen einen UI-Entrypoint für ihren Renderer.",
        path: ["entrypoints", "ui"],
      });
    }

    if (
      manifest.contributes.dashboard?.some(
        (item) => item.kind !== "quick-action",
      ) === true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Providerbasierte Dashboard Contributions benötigen einen UI- oder Server-Entrypoint.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.statusBar?.some((item) => item.kind !== "action") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Providerbasierte Status Bar Contributions benötigen einen UI- oder Server-Entrypoint.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.topbar?.some((item) => item.kind === "selector") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Providerbasierte Topbar Contributions benötigen einen UI- oder Server-Entrypoint.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.files?.some((item) => item.kind === "viewer") ===
        true &&
      manifest.entrypoints.ui === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "File Viewer Contributions benötigen einen UI-Entrypoint für ihren Renderer.",
        path: ["entrypoints", "ui"],
      });
    }

    if (
      manifest.contributes.terminal?.some((item) => item.kind === "profile") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Terminal Profile Contributions benötigen einen UI- oder Server-Entrypoint für ihren Provider.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.previews?.some((item) => item.kind === "target") ===
        true &&
      manifest.entrypoints.ui === undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Preview Target Contributions benötigen einen UI- oder Server-Entrypoint für ihren Provider.",
        path: ["entrypoints"],
      });
    }

    if (
      manifest.contributes.previews?.some((item) => item.kind === "target") ===
        true &&
      !manifest.permissions.some(
        (request) => request.permission === "preview.read",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Preview Target Contributions müssen die Permission preview.read anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.previews?.some(
        (item) => item.kind === "target" && item.sessionAccess === "manage",
      ) === true &&
      !manifest.permissions.some(
        (request) => request.permission === "preview.manage",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Verwaltende Preview Targets müssen die Permission preview.manage anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.agentTools !== undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Agent Tool Contributions benötigen einen Server-Entrypoint für ihre Handler.",
        path: ["entrypoints", "server"],
      });
    }

    if (
      manifest.contributes.backgroundServices !== undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Background Service Contributions benötigen einen Server-Entrypoint für ihre Provider.",
        path: ["entrypoints", "server"],
      });
    }

    if (
      manifest.contributes.scheduledJobs !== undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Scheduled Job Contributions benötigen einen Server-Entrypoint für ihre Provider.",
        path: ["entrypoints", "server"],
      });
    }

    if (
      (manifest.contributes.http !== undefined ||
        manifest.contributes.rpc !== undefined) &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "HTTP/RPC Contributions benötigen einen Server-Entrypoint für ihre Provider.",
        path: ["entrypoints", "server"],
      });
    }

    if (
      manifest.contributes.realtime !== undefined &&
      manifest.entrypoints.server === undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Realtime Contributions benötigen einen Server-Entrypoint für ihre Provider.",
        path: ["entrypoints", "server"],
      });
    }

    if (
      manifest.contributes.notifications !== undefined &&
      !manifest.permissions.some(
        (request) => request.permission === "notifications.create",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Notification Contributions müssen die Permission notifications.create anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.agentSkills !== undefined &&
      !manifest.permissions.some(
        (request) => request.permission === "agents.skills.register",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Agent Skill Contributions müssen die Permission agents.skills.register anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.agentTools !== undefined &&
      !manifest.permissions.some(
        (request) => request.permission === "agents.tools.register",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Agent Tool Contributions müssen die Permission agents.tools.register anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.terminal?.some((item) => item.kind === "profile") ===
        true &&
      !manifest.permissions.some(
        (request) => request.permission === "terminal.create",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Terminal Profile Contributions müssen die Permission terminal.create anfordern.",
        path: ["permissions"],
      });
    }

    if (
      manifest.contributes.files?.some((item) => item.kind === "viewer") ===
        true &&
      !manifest.permissions.some(
        (request) => request.permission === "files.read",
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "File Viewer Contributions müssen die Permission files.read anfordern.",
        path: ["permissions"],
      });
    }


}
