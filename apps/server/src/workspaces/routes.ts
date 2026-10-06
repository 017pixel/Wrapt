import type { FastifyInstance } from "fastify";
import { saveWorkspaceRegistryRequestSchema } from "@wrapt/contracts";
import { resolveWorkbenchUser, type WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import type { WorkspaceRegistryDatabase } from "./database.js";

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
}
