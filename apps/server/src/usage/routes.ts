import {
  accountResponseSchema,
  accountsResponseSchema,
  activateAccountResponseSchema,
  commandsResponseSchema,
  createAccountRequestSchema,
  discoveredAccountsResponseSchema,
  loginSessionResponseSchema,
  updateAccountRequestSchema,
  usageDashboardResponseSchema,
  usageRangeSchema,
  usageResponseSchema,
  usageSyncStatusSchema,
  usageTimelineResponseSchema,
} from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteServices } from "../api/services.js";
import { UsageSyncCoordinator } from "./sync-coordinator.js";

export async function registerUsageRoutes(app: FastifyInstance, services: RouteServices) {
  app.get("/commands", async () => commandsResponseSchema.parse(await services.commands.list()));
  app.get("/usage", async () => usageResponseSchema.parse(await services.usage.getUsage()));
  app.get("/usage/timeline", async () => usageTimelineResponseSchema.parse(await services.usageTimeline.get()));
  app.get("/usage/dashboard", async (request) => {
    const range = usageRangeSchema.parse((request.query as {range?:unknown}).range ?? "30d");
    return usageDashboardResponseSchema.parse(await services.analytics.dashboard(range));
  });
  const usageSync = new UsageSyncCoordinator({
    refreshLimits: async () => {
      await services.usage.refresh();
      await services.usageTimeline.refresh();
    },
    refreshAnalytics: () => services.analytics.sync(),
  });
  // Status für die Oberfläche, damit sie nach einem Klick automatisch nachlädt,
  // sobald der Hintergrund-Sync abgeschlossen ist.
  app.get("/usage/sync/status", async () => usageSyncStatusSchema.parse(usageSync.status()));
  // Der Sync läuft im Hintergrund; die Antwort kommt sofort mit dem aktuellsten
  // Stand, statt auf CodexBar zu warten.
  app.post("/usage/sync", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async () => { usageSync.start(); return usageDashboardResponseSchema.parse(await services.analytics.dashboard("30d")); });
  app.get("/accounts", async () => accountsResponseSchema.parse({ accounts: await services.accounts.listWithState() }));
  app.get("/accounts/discover", async () => discoveredAccountsResponseSchema.parse({ accounts: await services.accounts.discover() }));
  app.post("/accounts", async (request, reply) => {
    const account = await services.accounts.create(createAccountRequestSchema.parse(request.body));
    services.usage.invalidate();
    return reply.status(201).send(accountResponseSchema.parse({ account }));
  });
  app.patch("/accounts/:accountId", async (request) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(request.params);
    const account = services.accounts.update(accountId, updateAccountRequestSchema.parse(request.body));
    services.usage.invalidate();
    return accountResponseSchema.parse({ account });
  });
  app.delete("/accounts/:accountId", async (request, reply) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(request.params);
    await services.accounts.remove(accountId); services.usage.invalidate(); return reply.status(204).send();
  });
  // Schaltet den serverweit aktiven Codex-Account um. Alle danach gestarteten Codex-Prozesse
  // verwenden diesen Account, ohne dass eine erneute Anmeldung nötig ist.
  app.post("/accounts/:accountId/activate", { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request) => {
    const { accountId } = z.object({ accountId: z.string().uuid() }).parse(request.params);
    const result = await services.accounts.activate(accountId);
    services.usage.invalidate();
    return activateAccountResponseSchema.parse(result);
  });
  app.post("/accounts/login-session", async (request, reply) => {
    const body = createAccountRequestSchema.parse({ ...(request.body as object), source: "login" });
    const account = await services.accounts.create(body);
    services.usage.invalidate();
    return reply.status(201).send(loginSessionResponseSchema.parse({ account, terminalKind: account.provider, command: services.accounts.loginCommand(account) }));
  });
}
