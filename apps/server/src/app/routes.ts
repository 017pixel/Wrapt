import { constants as fsConstants } from "node:fs";
import { access } from "node:fs/promises";
import { operationalMetricsSchema, readinessResponseSchema } from "@wrapt/contracts";
import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { registerApiRoutes } from "../api/routes.js";
import { settings } from "../config/settings.js";
import { registerExtensionRoutes } from "../extensions/routes.js";
import { extensionDatabaseBackupStatus } from "../extensions/backup.js";
import { createWebBuildMetricsReader } from "../observability/web-build-metrics.js";
import { registerHermesRoutes } from "../hermes/routes.js";
import { hermesAuthority } from "../hermes/token.js";
import { readHermesUpdateState } from "../hermes/status-service.js";
import { registerHermesV2Routes } from "../hermes/v2/routes.js";
import { registerNotificationRoutes } from "../notifications/routes.js";
import { registerPluginRoutes } from "../plugins/routes.js";
import { registerCodePluginRoutes } from "../plugins/code-routes.js";
import { registerPreviewRoutes } from "../previews/routes.js";
import { registerUiSettingsRoutes } from "../settings/routes.js";
import { registerDevServerConfirmationRoutes } from "../previews/devServerConfirmations.js";
import { registerEditorOpenRoutes } from "../services/editorOpen.js";
import { createCommandService } from "../services/commandService.js";
import { createServiceStatusService } from "../services/serviceStatusService.js";
import { registerTerminalRoutes } from "../terminal/routes.js";
import { WorkspaceRegistryDatabase } from "../workspaces/database.js";
import { registerWorkspaceRegistryRoutes } from "../workspaces/routes.js";
import { TerminalFailure } from "../terminal/Manager.js";
import { AppError } from "../utils/errors.js";
import type { AppDependencies } from "./dependencies.js";

export async function registerApplicationRoutes(app: FastifyInstance, deps: AppDependencies) {
  const webBuildMetrics = createWebBuildMetricsReader(settings.webDistDirectory, settings.webBuildMetricsCacheMilliseconds);
  await app.register(async (scope) => {
    await scope.register(multipart, { limits: { files: 1, fileSize: Math.max(settings.fileGalleryMaxFileBytes, settings.fileManagerMaxUploadBytes) } });
    await registerApiRoutes(scope, {
      projects: deps.projects,
      pluginHub: deps.pluginCode.hub,
      statuses: createServiceStatusService(deps.servicesConfig.services),
      commands: createCommandService(deps.commandsConfig),
      usage: deps.liveUsage,
      analytics: deps.analytics,
      accounts: deps.accounts,
      usageTimeline: deps.usageTimeline,
      notes: deps.notesDatabase,
      fileGallery: deps.fileGallery,
      projectBrowser: deps.projectBrowser,
      identity: deps.identityOptions,
      fileManager: deps.fileManager,
      skillEditor: deps.skillEditor,
      projectFiles: deps.projectFiles,
      localPorts: deps.localPorts,
      previewSlots: deps.previewSlots,
      proxyOrigins: deps.proxyOrigins,
    });
  }, { prefix: "/api/v1" });
  app.get("/api/v1/health/readiness", async (_request, reply) => {
    const checks = await Promise.all([
      ["database", settings.databasePath],
      ["data-directory", settings.dataDirectory],
    ].map(async ([name, path]) => {
      try {
        await access(path!, fsConstants.R_OK | fsConstants.W_OK);
        return { name: name!, status: "ok" as const };
      } catch {
        return { name: name!, status: "failed" as const };
      }
    }));
    const status = checks.every((check) => check.status === "ok") ? "ready" as const : "degraded" as const;
    return reply.status(status === "ready" ? 200 : 503).send(
      readinessResponseSchema.parse({ status, timestamp: new Date().toISOString(), checks }),
    );
  });
  app.get<{ Querystring: { refresh?: string } }>("/api/v1/system/operational-metrics", async (request) => {
    if (request.query.refresh === "true") webBuildMetrics.clear();
    const [build, audit] = await Promise.all([webBuildMetrics.get(), deps.operationalAudit.verifyAsync()]);
    return operationalMetricsSchema.parse({
    ...deps.operationalMetrics.snapshot(),
    notificationSyncs: { terminal: deps.terminalStatusSync.syncErrorStatus() },
    push: deps.notificationPush.metrics(),
    build,
    audit: { ...audit, outboxPending: deps.operationalAudit.outboxPending() },
    preview: (() => {
      const slots = deps.previewSlots.list().slots;
      return {
        totalSlots: slots.length,
        freeSlots: slots.filter((slot) => slot.state === "free").length,
        resettingSlots: slots.filter((slot) => slot.state === "resetting").length,
        quarantinedSlots: slots.filter((slot) => slot.state === "quarantined").length,
      };
    })(),
    extensions: {
      quarantined: deps.extensionDatabase.quarantinedExtensionCount(),
      recoveredTransientOperations: deps.extensionDatabase.recoveredTransientOperationCount(),
      backup: extensionDatabaseBackupStatus(deps.extensionBackupDirectory),
    },
    });
  });
  await app.register(registerPreviewRoutes, {
    prefix: "/api/v1",
    slots: deps.previewSlots,
    database: deps.previewSlotDatabase,
    diagnostics: deps.previewDiagnostics,
    storage: deps.previewStorage,
    repair: deps.previewRepair,
    secrets: deps.previewSecrets,
    identity: deps.identityOptions,
    scanCandidates: deps.scanCandidates,
    diagnosticsEnabled: settings.previews.diagnosticsEnabled,
    diagnosticMaxBatchBytes: settings.previews.diagnosticMaxBatchBytes,
    diagnosticRetentionDays: settings.previews.diagnosticRetentionDays,
    devServers: deps.previewDevServers,
  });
  await app.register(registerDevServerConfirmationRoutes, {
    prefix: "/api/v1",
    devServers: deps.previewDevServers,
    database: deps.previewDevServerDatabase,
    identity: deps.identityOptions,
  });
  const resolveHermesProjectCwd = async (projectId: string | null) => {
    if (projectId === null) return settings.terminalDefaultCwd;
    const { project } = await deps.projects.get(projectId);
    if (project.availability !== "available") throw new AppError(400, "PROJECT_NOT_FOUND", "Das gewählte Projekt ist momentan nicht verfügbar.");
    return project.path;
  };
  await app.register(registerHermesRoutes, {
    prefix: "/api/v1",
    identity: deps.identityOptions,
    client: deps.hermesClient,
    manager: deps.hermesManager,
    sessions: deps.hermesSessions,
    status: deps.hermesStatus,
    resolveProjectCwd: resolveHermesProjectCwd,
  });
  await app.register(registerHermesV2Routes, {
    prefix: "/api/v1",
    authority: hermesAuthority(),
    enabled: () => settings.hermes.enabled,
    identity: deps.identityOptions,
    dashboard: deps.hermesClient,
    allowedRoots: settings.terminalAllowedRoots,
    deniedRoots: [settings.configDirectory, settings.dataDirectory],
    resolveProjectCwd: resolveHermesProjectCwd,
    policy: { rpcTimeoutMs: settings.hermes.requestTimeoutSeconds * 1_000 },
    organizationOptions: { databasePath: settings.databasePath, homeDirectory: settings.hermes.homeDirectory },
    resources: { writer: deps.hermesClient, readUpdateStatus: readHermesUpdateState },
  });
  await app.register(registerNotificationRoutes, { prefix: "/api/v1", database: deps.notificationDatabase, push: deps.notificationPush, configDirectory: settings.configDirectory, identity: deps.identityOptions });
  await app.register(registerEditorOpenRoutes, { prefix: "/api/v1", secrets: deps.editorOpenSecrets });
  await app.register(registerExtensionRoutes, { prefix: "/api/v1", manager: deps.extensionManager, catalog: deps.extensionCatalog, identity: deps.identityOptions, runtime: deps.extensionRuntime });
  await app.register(registerPluginRoutes, { prefix: "/api/v1", authoring: deps.pluginAuthoring, creatorSkillPath: settings.pluginCreatorSkillPath, identity: deps.identityOptions });
  await app.register(registerCodePluginRoutes, { prefix: "/api/v1", platform: deps.pluginCode, identity: deps.identityOptions });
  await app.register(registerTerminalRoutes, {
    prefix: "/api/v1",
    manager: deps.terminals,
    database: deps.terminalDatabase,
    identity: deps.identityOptions,
    resolveProjectPath: async (projectId) => {
      try {
        const { project } = await deps.projects.get(projectId);
        if (project.availability !== "available") {
          throw new TerminalFailure("INVALID_CWD", "Das gewählte Projekt ist momentan nicht verfügbar.");
        }
        return project.path;
      } catch (error) {
        if (error instanceof TerminalFailure) throw error;
        throw new TerminalFailure("INVALID_CWD", "Das gewählte Projekt wurde nicht gefunden.");
      }
    },
  });
  await app.register(registerWorkspaceRegistryRoutes, {
    prefix: "/api/v1",
    database: new WorkspaceRegistryDatabase(settings.databasePath),
    identity: deps.identityOptions,
  });
  await app.register(registerUiSettingsRoutes, {
    prefix: "/api/v1",
    database: deps.uiSettingsDatabase,
    identity: deps.identityOptions,
  });
}
