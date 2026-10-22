import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  hermesV2CronIdSchema, hermesV2CronListSchema, hermesV2CronDetailSchema, hermesV2CronRunsQuerySchema, hermesV2CronRunsSchema,
  hermesV2CronCreateSchema, hermesV2CronUpdateSchema, hermesV2CronConfirmSchema, hermesV2CronMutationSchema,
  hermesV2ResourceActionSchema, hermesV2ResourceErrorSchema, hermesV2MemorySchema, hermesV2PendingSchema,
  hermesV2ResourceSkillsSchema, hermesV2ResourceSkillDetailSchema, hermesV2DiagnosticsSchema,
  hermesV2SessionDeletionPreviewSchema, hermesV2SessionDeleteSchema, hermesV2SessionDeletedSchema,
  hermesV2ConfigurationSchema, hermesV2ConfigurationUpdateSchema,
} from "@wrapt/contracts/hermes-v2";
import { resolveWorkbenchUser, requireMutationOrigin } from "../../../security/workbench-identity.js";
import { isSameOriginReadRequest } from "../../../security/same-origin.js";
import { type ResourceHost, ResourceMutation } from "./host.js";
import { ResourceError } from "./errors.js";
import { resourceOutput } from "./output.js";
import { cronList, cronDetail, cronRuns, cronMutate } from "./cron.js";
import { memoryRead, pendingRead } from "./knowledge.js";
import { skillsRead, skillDetail } from "./skills.js";
import { diagnosticsRead } from "./diagnostics.js";
import { deletionPreview, deleteSession, sessionDeleteId } from "./session-delete.js";
import { resourcePolicy } from "./policy.js";
import { configurationRead, configurationUpdate } from "./configuration.js";

const empty = z.strictObject({});
const jobId = (request: FastifyRequest) => z.strictObject({ id: hermesV2CronIdSchema }).parse(request.params).id;
const sessionId = (request: FastifyRequest) => sessionDeleteId(z.strictObject({ id: z.string() }).parse(request.params).id);
export async function registerResourceRoutes(app: FastifyInstance, host: ResourceHost): Promise<void> {
  let active = 0; const busy = new Set<string>();
  const validity = new WeakMap<FastifyRequest, () => boolean>();
  const capture = (request: FastifyRequest, scope?: string) => host.context(scope, validity.get(request));
  const endpoint = (method: "GET" | "POST" | "PUT" | "DELETE", url: string,
    work: (request: FastifyRequest, owner: string, mutation: ResourceMutation) => Promise<unknown>) => {
    app.route({ method, url: `/hermes/v2${url}`, bodyLimit: 128 * 1024, handler: async (request, reply) => {
      reply.header("Cache-Control", "no-store"); const mutation = new ResourceMutation(); let entered = false; let locked = false;
      let live = true; const cancel = () => { live = false; };
      validity.set(request, () => live); reply.raw.once("close", cancel); request.raw.once("aborted", cancel);
      try {
        const owner = resolveWorkbenchUser(request, host.deps.identity); requireMutationOrigin(request);
        if (method === "GET" && !isSameOriginReadRequest(request)) throw new ResourceError(403, "FORBIDDEN", "Diese Ressourcenfläche ist nur vom Wrapt-Origin erreichbar.");
        if (!host.deps.enabled()) throw new ResourceError(403, "V2_DISABLED", "Hermes V2 ist deaktiviert.");
        if (active >= resourcePolicy.activeRequests) throw new ResourceError(429, "RATE_LIMITED", "Zu viele gleichzeitige Ressourcenanfragen.");
        if (method !== "GET") {
          if (busy.has(owner)) throw new ResourceError(409, "NATIVE_CONFLICT", "Eine Ressourcenänderung dieses Benutzers läuft bereits.");
          busy.add(owner); locked = true;
        }
        active++; entered = true; return await work(request, owner, mutation);
      } catch (error) {
        let failure = mutation.failure(error);
        if (!mutation.sent && error instanceof z.ZodError) failure = new ResourceError(400, "INVALID_RESOURCE_REQUEST", "Die Ressourcenanfrage ist nicht gültig.");
        if (!mutation.sent && error && typeof error === "object" && "code" in error && error.code === "SOURCE_IDENTITY_UNKNOWN") failure = new ResourceError(503, "SOURCE_IDENTITY_UNKNOWN", "Der aktuelle Profil- und HOME-Kontext ist nicht bestätigt.");
        if (!mutation.sent && error && typeof error === "object" && "statusCode" in error && [401, 403].includes(Number(error.statusCode))) failure = new ResourceError(Number(error.statusCode), "FORBIDDEN", "Der Zugriff auf Hermes wurde abgewiesen.");
        return reply.status(failure.status).send(hermesV2ResourceErrorSchema.parse({ code: failure.code, message: failure.message, outcome: failure.outcome, retryable: false }));
      } finally {
        live = false;
        validity.delete(request); reply.raw.off("close", cancel); request.raw.off("aborted", cancel);
        if (entered) active--;
        if (locked) { try { busy.delete(resolveWorkbenchUser(request, host.deps.identity)); } catch { /* Identität wurde vor dem Lock geprüft. */ } }
      }
    } });
  };
  endpoint("GET", "/configuration", async (request) => {
    empty.parse(request.query); const binding = await capture(request);
    return resourceOutput(host, binding, hermesV2ConfigurationSchema, await configurationRead(host, binding));
  });
  endpoint("PUT", "/configuration", async (request, _owner, mutation) => {
    empty.parse(request.query); const input = hermesV2ConfigurationUpdateSchema.parse(request.body);
    const binding = await capture(request, input.scope);
    return resourceOutput(host, binding, hermesV2ConfigurationSchema, await configurationUpdate(host, binding, mutation, input));
  });
  endpoint("GET", "/cron/jobs", async (request) => { empty.parse(request.query); const binding = await capture(request); return resourceOutput(host, binding, hermesV2CronListSchema, await cronList(host, binding)); });
  endpoint("GET", "/cron/jobs/:id", async (request) => { empty.parse(request.query); const id = jobId(request); const binding = await capture(request); return resourceOutput(host, binding, hermesV2CronDetailSchema, await cronDetail(host, binding, id)); });
  endpoint("GET", "/cron/jobs/:id/runs", async (request) => {
    const id = jobId(request); const { limit } = hermesV2CronRunsQuerySchema.parse(request.query); const binding = await capture(request);
    return resourceOutput(host, binding, hermesV2CronRunsSchema, await cronRuns(host, binding, id, limit));
  });
  endpoint("POST", "/cron/jobs", async (request, _owner, mutation) => {
    empty.parse(request.query); const input = hermesV2CronCreateSchema.parse(request.body); const binding = await capture(request, input.scope);
    const result = await resourceOutput(host, binding, hermesV2CronMutationSchema, await cronMutate(host, binding, mutation, "create", null, input));
    host.pool.invalidateResources("cron"); return result;
  });
  endpoint("PUT", "/cron/jobs/:id", async (request, _owner, mutation) => {
    empty.parse(request.query); const id = jobId(request); const input = hermesV2CronUpdateSchema.parse(request.body); const binding = await capture(request, input.scope);
    const result = await resourceOutput(host, binding, hermesV2CronMutationSchema, await cronMutate(host, binding, mutation, "update", id, input.updates));
    host.pool.invalidateResources("cron"); return result;
  });
  for (const operation of ["pause", "resume", "trigger", "delete"] as const) endpoint(operation === "delete" ? "DELETE" : "POST", `/cron/jobs/:id${operation === "delete" ? "" : `/${operation}`}`, async (request, _owner, mutation) => {
    empty.parse(request.query); const id = jobId(request); const input = (operation === "delete" || operation === "trigger" ? hermesV2CronConfirmSchema : hermesV2ResourceActionSchema).parse(request.body);
    const binding = await capture(request, input.scope);
    const result = await resourceOutput(host, binding, hermesV2CronMutationSchema, await cronMutate(host, binding, mutation, operation, id));
    host.pool.invalidateResources("cron"); return result;
  });
  endpoint("GET", "/memory", async (request) => { empty.parse(request.query); const binding = await capture(request); return resourceOutput(host, binding, hermesV2MemorySchema, await memoryRead(host, binding)); });
  endpoint("GET", "/pending", async (request) => { empty.parse(request.query); const binding = await capture(request); return resourceOutput(host, binding, hermesV2PendingSchema, await pendingRead(host, binding)); });
  endpoint("GET", "/skills", async (request, owner) => { empty.parse(request.query); const binding = await capture(request); return resourceOutput(host, binding, hermesV2ResourceSkillsSchema, await skillsRead(host, binding, owner)); });
  endpoint("GET", "/skills/detail", async (request, owner) => {
    const { name } = z.strictObject({ name: z.string().min(1).max(200) }).parse(request.query); const binding = await capture(request);
    return resourceOutput(host, binding, hermesV2ResourceSkillDetailSchema, await skillDetail(host, binding, owner, name));
  });
  endpoint("GET", "/diagnostics", async (request, owner) => { empty.parse(request.query); const binding = await capture(request); return resourceOutput(host, binding, hermesV2DiagnosticsSchema, await diagnosticsRead(host, binding, owner)); });
  endpoint("GET", "/sessions/:id/deletion", async (request, owner) => { empty.parse(request.query); const id = sessionId(request); const binding = await capture(request); return resourceOutput(host, binding, hermesV2SessionDeletionPreviewSchema, await deletionPreview(host, binding, owner, id)); });
  endpoint("DELETE", "/sessions/:id", async (request, owner, mutation) => {
    empty.parse(request.query); const id = sessionId(request); const input = hermesV2SessionDeleteSchema.parse(request.body);
    const preview = host.deletions.consume(owner, id, input.scope); const binding = await capture(request, preview.scope);
    const deleted = await deleteSession(host, binding, mutation, owner, id, preview.identity);
    const result = await resourceOutput(host, binding, hermesV2SessionDeletedSchema, deleted.result);
    deleted.cleanup();
    host.pool.invalidateResources("sessions", result.confirmedAbsentSessionIds); return result;
  });
}
