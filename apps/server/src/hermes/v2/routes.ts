import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { hermesV2ClientMessageSchema } from "@wrapt/contracts/hermes-v2";
import { createWebSocketSendQueue } from "../../utils/websocketSendQueue.js";
import { isWebSocketOriginAllowed } from "../../security/same-origin.js";
import { resolveWorkbenchUser } from "../../security/workbench-identity.js";
import { GatewayError, errorMessage } from "./errors.js";
import { GatewayPool } from "./pool.js";
import type { GatewayDependencies } from "./types.js";
import { z } from "zod";
import { registerOrganizationRoutes } from "./organization/routes.js";
import { registerAttachmentRoutes } from "./attachments/routes.js";
import { registerResourceRoutes } from "./resources/routes.js";

export interface RegisterHermesV2Options extends GatewayDependencies { pool?: GatewayPool }

/** Erst die explizite Registrierung aktiviert den Endpunkt; Import startet keinerlei Arbeit. */
export async function registerHermesV2Routes(app: FastifyInstance, options: RegisterHermesV2Options): Promise<void> {
  const pool = options.pool ?? new GatewayPool(options);
  app.addHook("onClose", async () => { pool.dispose(); });
  if (pool.organization) await registerOrganizationRoutes(app, pool.organization, options.identity, options.enabled);
  if (pool.attachments) await registerAttachmentRoutes(app, pool.attachments, options.identity, options.enabled);
  if (pool.resources) await registerResourceRoutes(app, pool.resources);
  app.get("/hermes/v2/gateway", {
    websocket: true,
    preValidation: async (request, reply) => {
      try {
        z.strictObject({ readEvidence: z.literal("1").optional(), composer: z.literal("1").optional(), work: z.literal("1").optional(), resources: z.literal("1").optional() }).parse(request.query);
        if (!options.enabled() || !isWebSocketOriginAllowed(request)) throw new GatewayError("FORBIDDEN", "Der Gateway ist nur vom Wrapt-Origin erreichbar.");
        resolveWorkbenchUser(request, options.identity);
      } catch {
        await reply.status(403).send({ error: "Der Zugriff auf den Hermes-Gateway wurde abgewiesen." });
      }
    },
  }, (socket, request) => {
    const queue = createWebSocketSendQueue({ socket, maxQueueBytes: pool.policy.sendQueueBytes });
    const connectionId = randomUUID();
    const used = new Set<string>();
    let pendingOperations = 0;
    let manager;
    try {
      manager = pool.get(resolveWorkbenchUser(request, options.identity));
      const query = request.query as { readEvidence?: string; composer?: string; work?: string; resources?: string };
      manager.add({ id: connectionId, readEvidence: query.readEvidence === "1", composer: query.composer === "1", work: query.work === "1", resources: query.resources === "1", send: (message) => { queue.send(message); } });
    } catch (error) {
      queue.send(errorMessage(error, null));
      socket.close(1008, "Gateway nicht verfügbar");
      queue.dispose();
      return;
    }
    const activeManager = manager;
    socket.on("message", (raw, binary) => {
      if (binary || Buffer.byteLength(raw.toString()) > pool.policy.browserBytes) {
        socket.close(1009, "Nachricht zu groß");
        return;
      }
      let value: unknown;
      try { value = JSON.parse(raw.toString()); }
      catch { queue.send(errorMessage(new GatewayError("INVALID_MESSAGE", "Ungültige Gateway-Nachricht."), null)); return; }
      const result = hermesV2ClientMessageSchema.safeParse(value);
      if (!result.success) { queue.send(errorMessage(new GatewayError("INVALID_MESSAGE", "Ungültige Gateway-Nachricht."), null)); return; }
      const message = result.data;
      if (used.has(message.id) || used.size >= pool.policy.maxOperations || pendingOperations >= pool.policy.maxPending) {
        queue.send(errorMessage(new GatewayError("RATE_LIMITED", "Die Anfrage wurde bereits verarbeitet oder die Verbindung ist ausgelastet."), message.id));
        return;
      }
      used.add(message.id);
      pendingOperations++;
      void activeManager.handle(connectionId, message).finally(() => { pendingOperations--; });
    });
    socket.once("close", (_code, reason) => {
      queue.dispose();
      activeManager.release(connectionId, reason.toString() === "v2-disabled" ? "v2-disabled" : "navigation");
    });
    socket.on("error", () => { /* close entfernt Abos und Puffer; keine Payloads protokollieren. */ });
  });
}
