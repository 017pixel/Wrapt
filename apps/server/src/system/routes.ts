import {
  appearanceResponseSchema,
  codexResetHistoryResponseSchema,
  codexResetHistorySettingsResponseSchema,
  contextMenuConfigResponseSchema,
  dashboardConfigSchema,
  healthResponseSchema,
  localPortsResponseSchema,
  mascotConfigResponseSchema,
  restartRequestSchema,
  restartResponseSchema,
  restartStatusResponseSchema,
  serverMetricsSchema,
  serverSummarySchema,
  servicesResponseSchema,
  t3ChannelRequestSchema,
  updateStatusResponseSchema,
  updateTriggerResponseSchema,
  usageMonitoringResponseSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { settings } from "../config/settings.js";
import { requireWorkbenchAdmin } from "../security/workbench-identity.js";
import { persistAppearanceTheme, persistContextMenuConfig, persistMascotConfig, readAppearanceTheme, readContextMenuConfig, readMascotConfig } from "../config/wrapt-config.js";
import { notifySharedConfigChanged } from "../settings/events.js";
import type { RouteServices } from "../api/services.js";
import { systemService } from "../services/systemService.js";
import { t3ChannelService } from "../services/t3ChannelService.js";
import { usageMonitoringService } from "../services/usageMonitoringService.js";
import { codexResetHistoryService } from "../services/codexResetHistoryService.js";
import { bootId, readRestartStatus, RestartError, triggerRestart, webBuildId } from "./restart.js";
import { getUpdateStatus, triggerUpdate, UpdateError } from "./update.js";
import { AppError } from "../utils/errors.js";

export async function registerSystemRoutes(app: FastifyInstance, services: RouteServices) {
  app.get("/health", async () => {
    return healthResponseSchema.parse({
      status: "ok",
      version: settings.appVersion,
      appName: settings.appName,
      instanceName: settings.instanceName,
      timestamp: new Date().toISOString(),
      bootId,
      webBuildId: webBuildId(),
    });
  });
  app.options("/health", async (request, reply) => {
    const requestedMethod = request.headers["access-control-request-method"]?.toUpperCase();
    reply.header("Vary", "Access-Control-Request-Method, Access-Control-Request-Headers");
    if (requestedMethod && requestedMethod !== "GET") {
      return reply.header("Allow", "GET, OPTIONS").status(405).send();
    }
    return reply
      .header("Access-Control-Allow-Methods", "GET")
      .header("Access-Control-Max-Age", "600")
      .status(204)
      .send();
  });
  app.get("/system/dashboard-config", async () => dashboardConfigSchema.parse(settings.dashboard));
  app.get("/system/appearance", async () => appearanceResponseSchema.parse({ theme: readAppearanceTheme(settings.configDirectory), source: "project" }));
  app.put("/system/appearance", async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const { theme } = appearanceResponseSchema.parse({ theme: request.body, source: "project" });
    persistAppearanceTheme(settings.configDirectory, theme);
    notifySharedConfigChanged("appearance");
    return appearanceResponseSchema.parse({ theme, source: "project" });
  });
  app.get("/system/context-menu", async () => contextMenuConfigResponseSchema.parse({
    contextMenu: readContextMenuConfig(settings.configDirectory),
  }));
  app.put("/system/context-menu", async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const { contextMenu } = contextMenuConfigResponseSchema.parse(request.body);
    persistContextMenuConfig(settings.configDirectory, contextMenu);
    notifySharedConfigChanged("contextMenu");
    return contextMenuConfigResponseSchema.parse({ contextMenu });
  });
  app.get("/system/mascot", async () => mascotConfigResponseSchema.parse({
    mascot: readMascotConfig(settings.configDirectory),
  }));
  app.put("/system/mascot", async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const { mascot } = mascotConfigResponseSchema.parse(request.body);
    persistMascotConfig(settings.configDirectory, mascot);
    notifySharedConfigChanged("mascot");
    return mascotConfigResponseSchema.parse({ mascot });
  });
  app.get("/system/codex-reset-history/settings", async () => codexResetHistorySettingsResponseSchema.parse({ settings: codexResetHistoryService.getSettings() }));
  app.put("/system/codex-reset-history/settings", async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const { settings: next } = codexResetHistorySettingsResponseSchema.parse({ settings: request.body });
    const updated = codexResetHistoryService.updateSettings(next);
    notifySharedConfigChanged("codexResetHistory");
    return codexResetHistorySettingsResponseSchema.parse({ settings: updated });
  });
  app.get("/system/codex-reset-history", async () => codexResetHistoryResponseSchema.parse(await codexResetHistoryService.get()));
  app.post("/system/restart", { config: { rateLimit: { max: 3, timeWindow: "1 minute" } } }, async (request, reply) => {
    requireWorkbenchAdmin(request, services.identity);
    const { target } = restartRequestSchema.parse(request.body);
    // Sichere Retries (D-015): Gleicher Key → gleiche jobId, kein zweiter Job.
    const rawKey = request.headers["x-idempotency-key"];
    const idempotencyKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    try {
      const { jobId, logFile } = triggerRestart(target, { idempotencyKey });
      return reply.status(202).send(restartResponseSchema.parse({ status: "accepted", jobId, target, bootId, webBuildId: webBuildId(), logFile }));
    } catch (error) {
      if (error instanceof RestartError) {
        request.log.warn({ err: error, target }, "Neustart abgelehnt");
        throw new AppError(409, "RESTART_REJECTED", `${error.message} ${error.hint}`, null, true);
      }
      throw error;
    }
  });
  app.get("/system/restart/status", async () =>
    restartStatusResponseSchema.parse({ ...readRestartStatus(), bootId, webBuildId: webBuildId() }),
  );
  app.get("/system/update/status", async () =>
    updateStatusResponseSchema.parse(await getUpdateStatus()),
  );
  app.post("/system/update", { config: { rateLimit: { max: 2, timeWindow: "5 minutes" } } }, async (request, reply) => {
    requireWorkbenchAdmin(request, services.identity);
    try {
      const { jobId, logFile, fromHash, toHash } = await triggerUpdate();
      return reply.status(202).send(updateTriggerResponseSchema.parse({ status: "accepted", jobId, target: "both", bootId, webBuildId: webBuildId(), logFile, fromHash, toHash }));
    } catch (error) {
      if (error instanceof UpdateError) {
        request.log.warn({ err: error }, "Update abgelehnt");
        throw new AppError(409, "UPDATE_REJECTED", `${error.message} ${error.hint}`, null, true);
      }
      throw error;
    }
  });
  app.get("/system/t3-channel", async () => t3ChannelService.status());
  // Setzt nur den Wunschkanal. Angewendet wird er beim nächsten Backend-Neustart
  // (Einstellungen → Dienst neu starten), damit der Nutzer den Zeitpunkt bestimmt.
  app.post("/system/t3-channel", async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const { channel } = t3ChannelRequestSchema.parse(request.body);
    const status = await t3ChannelService.setChannel(channel);
    notifySharedConfigChanged("t3Channel");
    return status;
  });
  app.get("/system/usage-monitoring", async () => usageMonitoringResponseSchema.parse({ monitoring: usageMonitoringService.get() }));
  // Wirkt sofort: Der Sync überspringt deaktivierte Anbieter, der Live-Cache meldet sie
  // als deaktiviert. Persistiert wird ausschließlich in config/wrapt.local.json.
  app.put("/system/usage-monitoring", async (request) => {
    requireWorkbenchAdmin(request, services.identity);
    const { monitoring } = usageMonitoringResponseSchema.parse(request.body);
    const result = usageMonitoringService.update(monitoring);
    // Gespeicherte Live-Antwort verwerfen, damit der neue Stand ohne Wartezeit ankommt.
    services.usage.invalidate();
    notifySharedConfigChanged("usageMonitoring");
    return usageMonitoringResponseSchema.parse({ monitoring: result });
  });
  app.get("/server/summary", async () => serverSummarySchema.parse(await systemService.getSummary()));
  app.get("/server/metrics", async () => serverMetricsSchema.parse(await systemService.getMetrics()));
  app.get("/services", async () => servicesResponseSchema.parse(await services.statuses.list()));
  app.get("/local-ports", async () => localPortsResponseSchema.parse(await services.localPorts.list()));
}
