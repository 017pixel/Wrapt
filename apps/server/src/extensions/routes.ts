import type { FastifyInstance } from "fastify";
import { pluginRuntimeResponseSchema } from "@wrapt/contracts";
import {
  extensionManagementAcceptedSchema,
  extensionManagementRequestSchema,
  extensionRegistrySnapshotSchema,
  extensionIdSchema,
} from "@wrapt/extension-contracts";
import { z } from "zod";
import { requireWorkbenchAdmin, type WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import { AppError } from "../utils/errors.js";
import type { LocalExtensionCatalog } from "./catalog.js";
import type { ExtensionManager } from "./manager.js";
import type { ExtensionRuntimeHost } from "./runtime-host.js";

export async function registerExtensionRoutes(app: FastifyInstance, options: {
  manager: ExtensionManager;
  catalog: LocalExtensionCatalog;
  identity: WorkbenchIdentityOptions;
  runtime?: ExtensionRuntimeHost;
}) {
  const manager = options.manager;
  const catalog = options.catalog;

  app.get("/extensions/catalog", async () => {
    return {
      providerId: "wrapt-catalog",
      revision: catalog.revision(),
      entries: catalog.list(),
    };
  });

  app.get("/extensions", async () => {
    return extensionRegistrySnapshotSchema.parse(manager.snapshot());
  });

  app.get("/extensions/runtime", async () => {
    const runtimes = options.runtime?.listActiveContent().map(({ pointer, content }) => ({
      extensionId: pointer.extensionId,
      version: pointer.version,
      packageIntegrity: pointer.packageIntegrity,
      content,
    })) ?? [];
    return pluginRuntimeResponseSchema.parse({ runtimes });
  });

  app.get("/extensions/:id", async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(128) }).parse(request.params);
    return manager.detail(id);
  });

  app.post("/extensions/:id/operations", async (request) => {
    requireWorkbenchAdmin(request, options.identity);
    const { id } = z.object({ id: extensionIdSchema }).parse(request.params);
    const parsed = extensionManagementRequestSchema.parse(request.body);
    if (parsed.extensionId !== id) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Der Pfad und der Request müssen dieselbe Extension adressieren.",
      );
    }
    return extensionManagementAcceptedSchema.parse(await manager.dispatch(parsed));
  });
}
