import type { FastifyInstance } from "fastify";
import { saveWorkspaceRegistryRequestSchema, workspaceProbeRequestSchema, workspaceProbeResponseSchema } from "@wrapt/contracts";
import { settings } from "../config/settings.js";
import { resolveWorkbenchUser, type WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import type { WorkspaceRegistryDatabase } from "./database.js";
import { probeWorkspaceUrl } from "./probe.js";

export async function registerWorkspaceRegistryRoutes(app: FastifyInstance, options: {
  database: WorkspaceRegistryDatabase;
  identity: WorkbenchIdentityOptions;
}) {
  app.get("/workspaces/registry", async (request) => {
    const userId = resolveWorkbenchUser(request, options.identity);
    return options.database.getRegistry(userId);
  });
  app.put("/workspaces/registry", async (request) => {
    const userId = resolveWorkbenchUser(request, options.identity);
    const parsed = saveWorkspaceRegistryRequestSchema.parse(request.body);
    return options.database.saveRegistry(userId, parsed.document, parsed.expectedRevision);
  });
  // Erreichbarkeits-Test für die Serverauswahl: Der Browser kann fremde
  // Health-Endpunkte seit S-008 nicht mehr cross-origin lesen, deshalb prüft
  // der eigene Server das Ziel und liefert das Ergebnis same-origin zurück.
  app.post("/workspaces/probe", async (request) => {
    resolveWorkbenchUser(request, options.identity);
    const { url } = workspaceProbeRequestSchema.parse(request.body);
    return workspaceProbeResponseSchema.parse(await probeWorkspaceUrl(url, settings.appVersion));
  });
}
