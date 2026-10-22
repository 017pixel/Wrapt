import multipart from "@fastify/multipart";
import { z } from "zod";
import { hermesV2AttachmentIdSchema, hermesV2IdSchema, hermesV2UploadStatusSchema } from "@wrapt/contracts/hermes-v2";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireMutationOrigin, resolveWorkbenchUser, type WorkbenchIdentityOptions } from "../../../security/workbench-identity.js";
import { GatewayError } from "../errors.js";
import type { AttachmentService } from "./service.js";
import type { AttachmentBinding } from "./binding.js";
import type { AttachmentRow } from "./store.js";
import { attachmentPolicy as p } from "./policy.js";
import { readUpload } from "./body.js";

interface RequestContext { owner: string; upload: string; binding: AttachmentBinding; release(): void }
export async function registerAttachmentRoutes(app: FastifyInstance, service: AttachmentService, identity: WorkbenchIdentityOptions, enabled: () => boolean): Promise<void> {
  await app.register(async (scope) => {
    await scope.register(multipart, { limits: { files: 1, fields: 0, parts: 1, fileSize: p.fileBytes, headerPairs: 20 } });
    const contexts = new WeakMap<FastifyRequest, RequestContext>();
    const authorize = (request: FastifyRequest) => {
      const owner = resolveWorkbenchUser(request, identity); requireMutationOrigin(request);
      if (!enabled()) throw new GatewayError("FORBIDDEN", "Hermes V2 ist deaktiviert.");
      return owner;
    };
    scope.setErrorHandler((error, request, reply) => {
      contexts.get(request)?.release();
      const known = error instanceof GatewayError ? error : null;
      const code = known?.code ?? (typeof error === "object" && error && "code" in error && /LIMIT|LARGE/.test(String(error.code)) ? "PAYLOAD_TOO_LARGE" : "INVALID_MESSAGE");
      const statuses: Record<string, number> = { FORBIDDEN: 403, SESSION_NOT_FOUND: 404, STALE_REQUEST: 409, PROJECT_FORBIDDEN: 403,
        PAYLOAD_TOO_LARGE: 413, RATE_LIMITED: 429, GATEWAY_OFFLINE: 503, SESSION_UNAVAILABLE: 409 };
      const authStatus = typeof error === "object" && error && "statusCode" in error && (error.statusCode === 401 || error.statusCode === 403) ? error.statusCode : null;
      const status = authStatus ?? statuses[code] ?? 400;
      reply.header("Cache-Control", "no-store").status(status).send({ code, message: known?.message ?? "Der Anhang konnte nicht verarbeitet werden.",
        outcome: known?.outcome ?? "not_sent", ...(contexts.get(request) ? { uploadId: contexts.get(request)!.upload } : {}) });
    });
    scope.post("/hermes/v2/attachments", { bodyLimit: p.fileBytes + 65_536, preValidation: async (request) => {
      const owner = authorize(request);
      const { sessionId } = z.strictObject({ sessionId: hermesV2IdSchema }).parse(request.query);
      const connection = z.string().uuid().parse(request.headers["x-hermes-v2-connection-id"]);
      const upload = z.string().uuid().parse(request.headers["x-hermes-v2-upload-id"]);
      const release = service.acquire(owner);
      try {
        const binding = await service.capture(owner, connection, sessionId);
        if (request.raw.aborted) throw new GatewayError("STALE_REQUEST", "Der Upload wurde abgebrochen.");
        contexts.set(request, { owner, upload, binding, release });
      }
      catch (error) { release(); throw error; }
    } }, async (request, reply) => {
      const context = contexts.get(request)!;
      const controller = new AbortController();
      const abort = () => controller.abort();
      const responseClosed = () => { if (!reply.raw.writableFinished) abort(); };
      request.raw.once("aborted", abort);
      reply.raw.once("close", responseClosed);
      if (request.raw.aborted) abort();
      const timer = setTimeout(abort, p.bodyMs); timer.unref();
      let reserved: { row: AttachmentRow; fresh: boolean } | undefined;
      try {
        const bytes = await readUpload(request, controller.signal, (name, mime) => { reserved = service.reserve(context.owner, context.upload, context.binding, name, mime); });
        clearTimeout(timer);
        context.binding.assert();
        if (!reserved) throw new GatewayError("INVALID_MESSAGE", "Die Uploaddatei fehlt.");
        if (!reserved.fresh) {
          const status = await service.status(context.owner, context.upload);
          context.binding.assert();
          return hermesV2UploadStatusSchema.parse(status);
        }
        return hermesV2UploadStatusSchema.parse(await service.stage(context.binding, reserved.row, bytes, controller.signal));
      } catch (error) {
        if (reserved?.fresh) service.store.fail(reserved.row, error instanceof GatewayError ? error.outcome : "not_sent");
        throw error;
      } finally {
        clearTimeout(timer); request.raw.off("aborted", abort); reply.raw.off("close", responseClosed); context.release();
      }
    });
    scope.get("/hermes/v2/attachments/uploads/:uploadId", async (request, reply) => {
      const owner = authorize(request); const input = z.strictObject({ uploadId: z.string().uuid() }).parse(request.params);
      const status = await service.status(owner, input.uploadId); authorize(request);
      reply.header("Cache-Control", "no-store"); return hermesV2UploadStatusSchema.parse(status);
    });
    scope.get("/hermes/v2/attachments/:id", async (request, reply) => {
      const owner = authorize(request); const { id } = z.strictObject({ id: hermesV2AttachmentIdSchema }).parse(request.params);
      const { handle, row } = await service.download(owner, id);
      try {
        authorize(request);
        const name = encodeURIComponent(Buffer.from(row.name, "utf8").toString("utf8"));
        reply.headers({ "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="download"; filename*=UTF-8''${name}`,
          "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Content-Length": String(row.bytes) });
        return reply.send(handle.createReadStream({ autoClose: true }));
      } catch (error) { await handle.close(); throw error; }
    });
  });
}
