import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  hermesV2IdSchema, hermesV2OrganizationGroupSchema, hermesV2CatalogQuerySchema,
  hermesV2SummaryLookupSchema, hermesV2SummaryLookupResultSchema, hermesV2SummaryPageSchema,
  hermesV2ReadAckSchema, hermesV2ReadResultSchema, hermesV2OrganizeSchema, hermesV2ReorderSchema,
  hermesV2UndoSchema, hermesV2OrganizationBatchSchema, hermesV2OrganizationMutationSchema,
  hermesV2MembersPageSchema, hermesV2NoticesPageSchema,
} from "@wrapt/contracts/hermes-v2";
import { resolveWorkbenchUser, requireMutationOrigin, type WorkbenchIdentityOptions } from "../../../security/workbench-identity.js";
import type { OrganizationService } from "./service.js";
import { OrganizationError } from "./errors.js";
import { OrganizationConflict } from "./actions.js";
import { organizationView } from "./views.js";
import { acknowledge } from "./acks.js";
import { members, notices } from "./queries.js";

const page = { cursor: z.string().max(512).optional(), limit: z.coerce.number().int().min(1).max(100).default(100) };
const batch = z.strictObject({ sessionId: z.union([hermesV2IdSchema, z.array(hermesV2IdSchema).min(1).max(100)]) });
export async function registerOrganizationRoutes(app: FastifyInstance, service: OrganizationService,
  identity: WorkbenchIdentityOptions, enabled: () => boolean): Promise<void> {
  const endpoint = (method: "GET" | "POST", url: string, work: (request: FastifyRequest, owner: string) => Promise<unknown>) => {
    app.route({ method, url, handler: async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      try {
        const owner = resolveWorkbenchUser(request, identity);
        requireMutationOrigin(request);
        if (!enabled()) throw new OrganizationError(403, "V2_DISABLED", "Hermes V2 ist deaktiviert.");
        return await work(request, owner);
      } catch (error) {
        if (error instanceof OrganizationConflict) return reply.status(409).send({ code: error.code, items: error.items, pinRevision: error.pinRevision, serverNow: error.serverNow });
        if (error instanceof OrganizationError) return reply.status(error.status).send({ code: error.code, message: error.message });
        if (error instanceof z.ZodError) return reply.status(400).send({ code: "INVALID_ORGANIZATION_REQUEST", message: "Die Organisationsanfrage ist nicht gültig." });
        const status = error && typeof error === "object" && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 503;
        return reply.status(status).send({ code: status === 401 || status === 403 ? "FORBIDDEN" : "ORGANIZATION_UNAVAILABLE", message: "Die Hermes-Organisation ist momentan nicht verfügbar." });
      }
    } });
  };
  endpoint("GET", "/hermes/v2/sessions", async (request, owner) => hermesV2SummaryPageSchema.parse(await service.page(owner, hermesV2CatalogQuerySchema.parse(request.query))));
  endpoint("POST", "/hermes/v2/sessions/lookup", async (request, owner) => {
    const input = hermesV2SummaryLookupSchema.parse(request.body);
    return hermesV2SummaryLookupResultSchema.parse(await service.catalog.lookup(owner, await service.context(), input.sessionIds));
  });
  endpoint("GET", "/hermes/v2/organization", async (request, owner) => {
    const input = batch.parse(request.query);
    const ids = Array.isArray(input.sessionId) ? input.sessionId : [input.sessionId];
    const scope = await service.context();
    return hermesV2OrganizationBatchSchema.parse(ids.map((id) => organizationView(service.repo, owner, scope.id, id, Date.now())));
  });
  endpoint("GET", "/hermes/v2/organization/members", async (request, owner) => {
    const input = z.strictObject({ ...page, group: hermesV2OrganizationGroupSchema }).parse(request.query);
    const scope = await service.context();
    return hermesV2MembersPageSchema.parse(members(service.repo, owner, scope.id, input.group, input.cursor, input.limit, Date.now()));
  });
  endpoint("GET", "/hermes/v2/organization/notices", async (request, owner) => {
    const input = z.strictObject({ ...page, sessionId: hermesV2IdSchema }).parse(request.query);
    const scope = await service.context();
    return hermesV2NoticesPageSchema.parse(notices(service.repo, service.evidence, owner, scope.id, input.sessionId, input.cursor, input.limit, Date.now()));
  });
  endpoint("POST", "/hermes/v2/organization/read", async (request, owner) => {
    const input = hermesV2ReadAckSchema.parse(request.body);
    const scope = await service.context();
    return hermesV2ReadResultSchema.parse(acknowledge(service.repo, service.evidence, owner, scope.id, input, Date.now()));
  });
  endpoint("POST", "/hermes/v2/organization/action", async (request, owner) => {
    const input = hermesV2OrganizeSchema.parse(request.body);
    const scope = await service.context();
    if (input.action === "snooze") await service.prepareSnooze(owner, scope, input.sessionId);
    return hermesV2OrganizationMutationSchema.parse(service.actions.action(owner, scope.id, input));
  });
  endpoint("POST", "/hermes/v2/organization/reorder", async (request, owner) => {
    const input = hermesV2ReorderSchema.parse(request.body);
    return hermesV2OrganizationMutationSchema.parse(service.actions.reorder(owner, (await service.context()).id, input));
  });
  endpoint("POST", "/hermes/v2/organization/undo", async (request, owner) => {
    const input = hermesV2UndoSchema.parse(request.body);
    return hermesV2OrganizationMutationSchema.parse(service.actions.restore(owner, (await service.context()).id, input.handle));
  });
}
