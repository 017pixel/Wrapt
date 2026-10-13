import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { saveTerminalWorkspaceRequestSchema, terminalWorkspaceOpsRequestSchema, terminalWorkspaceSchema, terminalWorkspaceV2Schema } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { toApiError, toTerminalError } from "../utils/api-errors.js";
import { TerminalFailure } from "./Manager.js";
import type { TerminalManager } from "./Manager.js";
import type { TerminalDatabase } from "./database.js";
import { clientTerminalMessageSchema, createTerminalFloodGuard, type ServerTerminalMessage, type TerminalErrorCode } from "./protocol.js";
import { TerminalWorkspaceService } from "./workspace/TerminalWorkspaceService.js";
import { migrateTerminalWorkspaceV1 } from "./workspace/terminalWorkspaceMigrations.js";
import { isSameOriginRequest } from "../security/same-origin.js";
import { isWorkbenchUserAllowed, resolveWorkbenchUser, type WorkbenchIdentityOptions } from "../security/workbench-identity.js";
import { createWebSocketSendQueue } from "../utils/websocketSendQueue.js";

/** Abstand der WebSocket-Pings; ein ausbleibender Pong räumt den Client. */
const TERMINAL_SOCKET_HEARTBEAT_MS = 30_000;

/** Minimaler Socket-Ausschnitt für den Heartbeat (in Tests ersetzbar). */
export interface TerminalHeartbeatSocket {
  ping(): void;
  terminate(): void;
  on(event: "pong", listener: () => void): unknown;
}

/**
 * Wacht über einen Terminal-Socket. Stirbt er ohne sauberes Close (z. B. ein
 * abgestürzter Proxy), meldet der TCP-Stack das erst nach Minuten: Der tote
 * Client bliebe als Geometrie-Eigentümer registriert und hielte die PTY-Größe
 * für alle lebenden Clients fest. Browser beantworten Ping-Frames nativ; ein
 * ausbleibender Pong über ein volles Intervall bedeutet tot. Gibt die
 * Aufräumfunktion für das Intervall zurück.
 */
export function attachTerminalSocketHeartbeat(socket: TerminalHeartbeatSocket, intervalMs = TERMINAL_SOCKET_HEARTBEAT_MS): () => void {
  let alive = true;
  const heartbeat = setInterval(() => {
    if (!alive) { socket.terminate(); return; }
    alive = false;
    try { socket.ping(); } catch { socket.terminate(); }
  }, intervalMs);
  heartbeat.unref?.();
  socket.on("pong", () => { alive = true; });
  return () => clearInterval(heartbeat);
}

function terminalIdentity(request: FastifyRequest, identityOptions: WorkbenchIdentityOptions): string {
  try {
    const identity = resolveWorkbenchUser(request, identityOptions);
    if (!isWorkbenchUserAllowed(request, identity, identityOptions)) {
      throw new TerminalFailure("FORBIDDEN", "Dieser Benutzer darf kein Terminal öffnen.");
    }
    return identity;
  } catch (error) {
    if (error instanceof TerminalFailure) throw error;
    if (error instanceof AppError) {
      const code = error.statusCode === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
      throw new TerminalFailure(code, error.message);
    }
    throw error;
  }
}

function errorMessage(error: unknown): { code: TerminalErrorCode; message: string } {
  return toTerminalError(error);
}

function httpIdentity(request: FastifyRequest, identityOptions: WorkbenchIdentityOptions) {
  try { return terminalIdentity(request, identityOptions); }
  catch (error) {
    const mapped = toApiError(error);
    throw new AppError(mapped.status, mapped.code, mapped.message);
  }
}

const sessionParamsSchema = z.object({ sessionId: z.string().uuid() });

function sessionResponse(session: Awaited<ReturnType<TerminalManager["listSessions"]>>[number]) {
  return {
    id: session.id,
    runtimeId: session.runtimeId,
    kind: session.kind,
    mode: session.mode,
    projectId: session.projectId,
    cwd: session.cwd,
    pid: session.pid,
    cols: session.cols,
    rows: session.rows,
    status: session.status,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: new Date(session.updatedAt).toISOString(),
    exitCode: session.exitCode,
    exitSignal: session.exitSignal,
    supervisor: session.supervisorName ? "tmux" as const : "direct" as const,
    managed: session.supervisorName?.startsWith("wrapt-") || session.supervisorName?.startsWith("workbench-") || false,
    connectedClients: session.connectedClients,
  };
}

export async function registerTerminalRoutes(app: FastifyInstance, options: {
  manager: TerminalManager;
  database?: TerminalDatabase;
  identity?: WorkbenchIdentityOptions;
  allowedUsers?: readonly string[];
  developmentUser?: string;
  localLoopbackTrust?: boolean;
  localUsername?: string;
  resolveProjectPath?: (projectId: string) => Promise<string>;
}) {
  const identityOptions = options.identity ?? {
    allowedUsers: options.allowedUsers ?? [],
    ...(options.developmentUser ? { developmentUser: options.developmentUser } : {}),
    ...(options.localLoopbackTrust !== undefined ? { localLoopbackTrust: options.localLoopbackTrust } : {}),
    ...(options.localUsername ? { localUsername: options.localUsername } : {}),
  };
  app.get("/terminal/sessions", async (request) => {
    const userId = httpIdentity(request, identityOptions);
    return { sessions: (await options.manager.listSessions(userId)).map(sessionResponse), updatedAt: new Date().toISOString() };
  });
  app.get("/terminal/workspace", async (request) => {
    const userId = httpIdentity(request, identityOptions);
    if (!options.database) throw new AppError(500, "INTERNAL_ERROR", "Die Terminal-Registry ist nicht verfügbar.");
    return options.database.getWorkspace(userId);
  });
  app.put("/terminal/workspace", async (request) => {
    const userId = httpIdentity(request, identityOptions);
    if (!options.database) throw new AppError(500, "INTERNAL_ERROR", "Die Terminal-Registry ist nicht verfügbar.");
    const parsed = saveTerminalWorkspaceRequestSchema.parse(request.body);
    const document = parsed.document.version === 1
      ? migrateTerminalWorkspaceV1(terminalWorkspaceSchema.parse(parsed.document))
      : terminalWorkspaceV2Schema.parse(parsed.document);
    return options.database.saveWorkspace(userId, document, parsed.expectedRevision);
  });
  // Serverseitige Workspace-Operationen: verlustfreie, transaktionale
  // Mutationen statt blindem Überschreiben des ganzen Dokuments.
  app.post("/terminal/workspace/ops", async (request) => {
    const userId = httpIdentity(request, identityOptions);
    if (!options.database) throw new AppError(500, "INTERNAL_ERROR", "Die Terminal-Registry ist nicht verfügbar.");
    const parsed = terminalWorkspaceOpsRequestSchema.parse(request.body);
    const current = options.database.getWorkspace(userId);
    if (current.revision !== parsed.expectedRevision) {
      throw new AppError(409, "TERMINAL_WORKSPACE_CONFLICT", "Das Terminal-Layout wurde auf einem anderen Gerät geändert.");
    }
    const service = new TerminalWorkspaceService();
    const updated = service.applyOperations(current.document, parsed.operations);
    const saved = options.database.saveWorkspace(userId, updated, parsed.expectedRevision);
    // Ein gelöschter Eintrag beendet seine Sitzung. Nur das Layout zu löschen
    // ließ bislang unsichtbare Prozesse und belegte Quoten zurück.
    for (const operation of parsed.operations) {
      if (operation.type !== "deleteEntry") continue;
      const entry = current.document.entries.find((candidate) => candidate.id === operation.id);
      if (!entry?.runtimeId || updated.entries.some((candidate) => candidate.runtimeId === entry.runtimeId)) continue;
      try {
        const session = options.manager.resolveRuntime(userId, entry.runtimeId);
        await options.manager.closeSession(userId, session.id);
      } catch (error) {
        if (!(error instanceof TerminalFailure && error.code === "SESSION_NOT_FOUND")) throw error;
      }
    }
    return saved;
  });
  app.post("/terminal/sessions/:sessionId/restart", async (request) => {
    const userId = httpIdentity(request, identityOptions);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    const session = await options.manager.restartSession(userId, sessionId);
    return { session: options.manager.getSessionMetadata(userId, session.id) };
  });
  app.delete("/terminal/sessions/:sessionId", async (request, reply) => {
    const userId = httpIdentity(request, identityOptions);
    const { sessionId } = sessionParamsSchema.parse(request.params);
    await options.manager.closeSession(userId, sessionId);
    return reply.status(204).send();
  });

  app.get("/terminal", { websocket: true }, (socket, request) => {
    let userId: string;
    try {
      if (!isSameOriginRequest(request)) throw new TerminalFailure("FORBIDDEN", "Terminal-WebSockets sind nur vom Workbench-Origin erlaubt.");
      userId = terminalIdentity(request, identityOptions);
    }
    catch (error) {
      const failure = errorMessage(error);
      socket.send(JSON.stringify({ type: "terminal.error", ...failure } satisfies ServerTerminalMessage));
      socket.close(1008, failure.code);
      return;
    }
    const stopHeartbeat = attachTerminalSocketHeartbeat(socket);
    const sendQueue = createWebSocketSendQueue<ServerTerminalMessage>({ socket, maxQueueBytes: 8 * 1024 * 1024 });
    const send = (message: ServerTerminalMessage) => { sendQueue.send(message); };
    const clientId = randomUUID();
    // Multiplexter Socket: Ein Browser-Tab hält einen WebSocket und mehrere
    // Runtime-Subscriptions. Jede Subscription besitzt ihren eigenen Detach.
    const subscriptions = new Map<string, () => void>();
    const detachSubscription = (runtimeId: string) => {
      const detach = subscriptions.get(runtimeId);
      if (detach) { detach(); subscriptions.delete(runtimeId); }
    };
    const sessionOf = (runtimeId: string) => options.manager.resolveRuntime(userId, runtimeId);
    // Flood-Schutz pro Socket (S-009): Nachrichtenflut schließt mit 1013.
    const floodGuard = createTerminalFloodGuard();
    const messageQueues = new Map<string, Promise<void>>();
    const reportError = (error: unknown, raw: unknown) => {
      let runtimeId: string | undefined;
      let sessionId: string | undefined;
      try {
        const value = typeof raw === "string" ? JSON.parse(raw) : Buffer.isBuffer(raw) ? JSON.parse(raw.toString()) : null;
        if (typeof value?.runtimeId === "string") runtimeId = value.runtimeId;
        if (typeof value?.sessionId === "string") sessionId = value.sessionId;
      } catch { /* Ohne gültige Zuordnung bleibt der Fehler socketweit. */ }
      send({ type: "terminal.error", ...(runtimeId ? { runtimeId } : {}), ...(sessionId ? { sessionId } : {}), ...errorMessage(error) });
    };
    socket.on("message", (raw: unknown) => {
      if (!floodGuard.tryConsume("messages")) {
        socket.close(1013, "Zu viele Terminalnachrichten");
        return;
      }
      let message: z.infer<typeof clientTerminalMessageSchema>;
      let queueKey: string;
      try {
        if (typeof raw !== "string" && !Buffer.isBuffer(raw)) throw new TerminalFailure("INVALID_MESSAGE", "Die Terminalnachricht ist ungültig.");
        message = clientTerminalMessageSchema.parse(JSON.parse(raw.toString()));
        if (message.type === "terminal.ping") { send({ type: "terminal.pong" }); return; }
        queueKey = "runtimeId" in message && message.runtimeId ? message.runtimeId
          : "sessionId" in message && message.sessionId ? options.manager.resolveSession(userId, message.sessionId).runtimeId : "connection";
      } catch (error) { reportError(error, raw); return; }
      // Eine langsame Runtime blockiert weder den Heartbeat noch andere
      // Terminals auf demselben multiplexten Socket. Je Runtime bleibt FIFO.
      const pending = (messageQueues.get(queueKey) ?? Promise.resolve()).then(async () => {
      if (socket.readyState !== 1) return;
      try {
        switch (message.type) {
          case "terminal.create": {
            const session = (async () => {
              const projectCwd = message.projectId && options.resolveProjectPath ? await options.resolveProjectPath(message.projectId) : undefined;
              return options.manager.createSession(userId, {
                ...(message.runtimeId ? { runtimeId: message.runtimeId } : {}),
                kind: message.kind,
                projectId: message.projectId ?? null,
                cols: message.cols,
                rows: message.rows,
                mode: message.mode,
                ...(message.accountId ? { accountId: message.accountId } : {}),
                clientId,
                ...(message.cwd !== undefined ? { cwd: message.cwd } : projectCwd !== undefined ? { cwd: projectCwd } : {}),
              });
            })();
            const created = await session;
            send({ type: "terminal.created", requestId: message.requestId, sessionId: created.id, runtimeId: created.runtimeId, kind: created.kind, projectId: created.projectId, status: created.status, cwd: created.cwd, pid: created.pid });
            // Eine während des Starts geschlossene Verbindung darf keine
            // verwaiste Geometrie-Eigentümerschaft zurücklassen.
            if (socket.readyState !== 1) options.manager.detachClient(userId, clientId);
            break;
          }
          case "terminal.attach": {
            const viewport = message.cols !== undefined && message.rows !== undefined ? { cols: message.cols, rows: message.rows } : undefined;
            const session = options.manager.resolveSession(userId, message.sessionId);
            const detach = await options.manager.attachSession(userId, session.id, send, clientId, viewport);
            if (socket.readyState !== 1) detach();
            else subscriptions.set(session.runtimeId, detach);
            break;
          }
          case "terminal.subscribe": {
            const session = sessionOf(message.runtimeId);
            detachSubscription(session.runtimeId);
            const viewport = message.cols !== undefined && message.rows !== undefined ? { cols: message.cols, rows: message.rows } : undefined;
            const detach = await options.manager.attachSession(userId, session.id, send, clientId, viewport, message.state ?? null);
            if (socket.readyState !== 1) detach();
            else subscriptions.set(session.runtimeId, detach);
            break;
          }
          case "terminal.unsubscribe": detachSubscription(message.runtimeId); break;
          case "terminal.sync": {
            const session = sessionOf(message.runtimeId);
            await options.manager.syncSession(userId, session.id, clientId, message.state);
            break;
          }
          case "terminal.takeControl": {
            const session = sessionOf(message.runtimeId);
            options.manager.takeControl(userId, session.id, clientId, message.cols, message.rows);
            break;
          }
          case "terminal.input":
            options.manager.activateClient(userId, message.sessionId, clientId);
            options.manager.writeToSession(userId, message.sessionId, message.data);
            break;
          case "terminal.resize":
            // Ein ResizeObserver darf niemals allein den Primary-Status übernehmen.
            // Resize meldet nur den lokalen Wunsch-Viewport; die PTY übernimmt ihn
            // nur, wenn dieser Client bereits Primary ist. Der Primary wechselt
            // ausschließlich über echte Interaktion (Eingabe) oder beim Trennen.
            options.manager.resizeSession(userId, message.sessionId, message.cols, message.rows, clientId);
            break;
          case "terminal.clear": options.manager.clearSessionHistory(userId, message.sessionId); break;
          case "terminal.restart": await options.manager.restartSession(userId, message.sessionId); break;
          case "terminal.close": {
            const session = options.manager.resolveSession(userId, message.sessionId);
            const runtimeId = session.runtimeId;
            await options.manager.closeSession(userId, message.sessionId);
            detachSubscription(runtimeId);
            break;
          }
        }
      } catch (error) {
        reportError(error, raw);
      }
      });
      messageQueues.set(queueKey, pending);
      void pending.finally(() => { if (messageQueues.get(queueKey) === pending) messageQueues.delete(queueKey); });
    });
    socket.on("close", () => {
      stopHeartbeat();
      for (const detach of subscriptions.values()) detach();
      subscriptions.clear();
      sendQueue.dispose();
      options.manager.detachClient(userId, clientId);
    });
    socket.on("error", () => {
      for (const detach of subscriptions.values()) detach();
      subscriptions.clear();
      sendQueue.dispose();
      options.manager.detachClient(userId, clientId);
    });
  });
}
