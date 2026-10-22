import type { FastifyRequest } from "fastify";
import type { WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import { resolveWorkbenchUser } from "../security/workbench-identity.js";
import type { PluginRuntimeHub } from "./code-runtime-hub.js";

export interface PluginRouteOperations {
  pluginHub?: PluginRuntimeHub;
  identity?: WorkbenchIdentityOptions;
}

/** Browser und SDK durchlaufen dieselbe Fachoperation einschließlich Hooks. */
export async function pluginRouteOperation<T>(services: PluginRouteOperations, request: FastifyRequest, operation: string, input: unknown, fallback: () => T | Promise<T>): Promise<T> {
  if (!services.pluginHub || !services.identity) return fallback();
  const controller = new AbortController();
  const aborted = () => controller.abort();
  request.raw.once("aborted", aborted);
  try {
    return await services.pluginHub.callHost(operation, input, { userId: resolveWorkbenchUser(request, services.identity), requestId: request.id, signal: controller.signal }) as T;
  } finally { request.raw.off("aborted", aborted); }
}
