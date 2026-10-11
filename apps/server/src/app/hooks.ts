import { apiErrorSchema } from "@wrapt/contracts";
import type { FastifyInstance } from "fastify";
import { isAuditedMutation } from "../observability/audit.js";
import {
  isProtectedWorkbenchRequest,
  requestLocalLoopbackIdentity,
  requestIdentity,
  requireMutationOrigin,
  resolveWorkbenchUser,
} from "../security/workbench-identity.js";
import { toApiError } from "../utils/api-errors.js";
import type { AppDependencies } from "./dependencies.js";

export function registerCoreHooks(app: FastifyInstance, deps: AppDependencies) {
  app.setErrorHandler((error, request, reply) => {
    const mapped = toApiError(error);
    if (mapped.logAsUnhandled) {
      app.log.error({ err: error }, "Unbehandelter Serverfehler");
    } else if (mapped.status >= 500) {
      app.log.warn({ err: error, code: mapped.code }, "Fachlicher Serverfehler");
    }
    return reply.status(mapped.status).send(
      apiErrorSchema.parse({ error: { code: mapped.code, message: mapped.message, details: mapped.details, requestId: request.id, retryable: mapped.retryable } }),
    );
  });

  app.addHook("onSend", (request, reply, payload, done) => {
    reply.header("X-Request-Id", request.id);
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    done(null, payload);
  });

  app.addHook("onResponse", async (request, reply) => {
    deps.operationalMetrics.finish(
      request,
      request.method,
      request.routeOptions.url ?? request.url.split("?", 1)[0] ?? "unbekannt",
      reply.statusCode,
    );
    if (!isAuditedMutation(request.method, request.url)) return;
    try {
      const outcome = deps.operationalAudit.recordDurable({
        requestId: request.id,
        actor: auditActor(request, deps.identityOptions),
        action: `${request.method} ${request.routeOptions.url}`,
        target: request.url.split("?", 1)[0] ?? request.url,
        statusCode: reply.statusCode,
      });
      if (outcome === "outbox") {
        request.log.warn({ requestId: request.id }, "Auditstore nicht verfügbar; Ereignis liegt in der Outbox.");
      }
    } catch (error) {
      request.log.error({ err: error }, "Audit-Eintrag konnte weder geschrieben noch zwischengespeichert werden");
    }
  });

  app.addHook("onRequest", async (request) => {
    deps.operationalMetrics.start(request);
  });
  app.addHook("onRequest", async (request) => {
    if (!isProtectedWorkbenchRequest(request)) return;
    resolveWorkbenchUser(request, deps.identityOptions);
    requireMutationOrigin(request);
  });
}

function auditActor(request: Parameters<typeof requestIdentity>[0], identityOptions: AppDependencies["identityOptions"]): string {
  const tailscaleIdentity = requestIdentity(request);
  if (tailscaleIdentity) return tailscaleIdentity;
  if (!identityOptions.localLoopbackTrust) return "unbekannt";
  return requestLocalLoopbackIdentity(request, identityOptions) ?? "unbekannt";
}
