import { WebSocket, type RawData } from "ws";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { GatewayError, protocolError } from "./errors.js";
import { parse, eventSchema, readySchema, requestFrameSchema } from "./upstream-schemas.js";
import type { ConnectionState, DashboardReader, GatewayFrame } from "./types.js";
import type { HermesV2Policy } from "./policy.js";
import { sendFrame, serializeFrame } from "./send-boundary.js";

export type UpstreamMethod = "client.capabilities" | "gateway.ping" | "session.list" | "session.active_list"
  | "session.create" | "session.resume" | "session.activate" | "session.events.since" | "prompt.submit"
  | "session.interrupt" | "session.steer" | "model.options" | "commands.catalog" | "config.set"
  | "clarify.lock" | "subagent.list" | "process.list" | "session.title" | "file.attach"
  | "subagent.interrupt" | "subagent.tail" | "process.kill" | "prompt.background" | "prompt.btw";
interface Pending {
  resolve(value: unknown): void;
  reject(error: GatewayError): void;
  timer: NodeJS.Timeout;
  mutation: boolean;
}
interface Options {
  authority: string;
  token: DashboardReader["token"];
  policy: HermesV2Policy;
  onFrame(frame: GatewayFrame): void;
  onState(state: ConnectionState, epoch: string | null): void;
  onTransportClosed(transportId: string): void;
  onProtocolError(): boolean;
}
const lifecycleReads = new Set<UpstreamMethod>(["gateway.ping", "session.active_list", "session.events.since", "subagent.list", "process.list"]);

/** Hält ausschließlich Transportzustand. Konstruktion öffnet keine Verbindung. */
export class GatewayUpstream {
  epoch: string | null = null;
  state: ConnectionState = "offline";
  transportId: string | null = null;
  quarantined = false;
  private socket: WebSocket | null = null;
  private opening: Promise<void> | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private wanted = false;
  private disposed = false;
  private retry: NodeJS.Timeout | undefined;
  private heartbeat: NodeJS.Timeout | undefined;
  private attempts = 0;
  private lastPong = 0;

  constructor(private readonly options: Options) {}

  get canReadLifecycle(): boolean {
    return !this.disposed && this.socket?.readyState === WebSocket.OPEN && (this.state === "online" || this.quarantined);
  }

  async connect(): Promise<void> {
    if (this.disposed) throw new GatewayError("GATEWAY_OFFLINE", "Die Gateway-Verbindung wurde geschlossen.");
    if (this.quarantined) throw protocolError();
    this.wanted = true;
    if (this.state === "online") return;
    if (!this.opening) this.opening = this.open().finally(() => { this.opening = null; });
    return this.opening;
  }

  async call(method: UpstreamMethod, params: Record<string, unknown>, mutation = false): Promise<unknown> {
    if (this.quarantined && (mutation || !lifecycleReads.has(method))) throw protocolError();
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new GatewayError("GATEWAY_OFFLINE", "Der Hermes-Gateway ist nicht verbunden.", "not_sent", true);
    }
    if (this.pending.size >= this.options.policy.maxPending) {
      throw new GatewayError("RATE_LIMITED", "Zu viele gleichzeitige Hermes-Anfragen.", "not_sent", true);
    }
    const id = this.nextId++;
    const frame = serializeFrame({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new GatewayError("GATEWAY_OFFLINE", "Die Hermes-Anfrage hat zu lange gedauert.", mutation ? "unknown" : "not_sent", true));
      }, this.options.policy.rpcTimeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer, mutation });
      try {
        sendFrame(this.socket!, frame, mutation, (error) => {
          if (!error) return;
          const entry = this.pending.get(id);
          if (!entry) return;
          clearTimeout(entry.timer);
          this.pending.delete(id);
          entry.reject(new GatewayError("GATEWAY_OFFLINE", "Die Hermes-Verbindung wurde unterbrochen.", mutation ? "unknown" : "not_sent", true));
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  respond(id: string, result: Record<string, unknown> | null): Promise<void> {
    if (this.quarantined && result !== null) throw protocolError();
    if (this.socket?.readyState !== WebSocket.OPEN) throw new GatewayError("GATEWAY_OFFLINE", "Die Antwort konnte nicht gesendet werden.");
    // Keine fremden Rohfehler oder Response-Werte in Logger/Fehlermeldungen übernehmen.
    const frame = result === null
      ? { jsonrpc: "2.0", id, error: { code: -32601, message: "Diese Oberfläche unterstützt die Anfrage nicht." } }
      : { jsonrpc: "2.0", id, result };
    const serialized = serializeFrame(frame);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new GatewayError("GATEWAY_OFFLINE", "Die Hermes-Antwort konnte nicht bestätigt werden.", "unknown", true)), this.options.policy.rpcTimeoutMs);
      timer.unref();
      try {
        sendFrame(this.socket!, serialized, result !== null, (error) => {
          clearTimeout(timer);
          if (error) reject(new GatewayError("GATEWAY_OFFLINE", "Die Hermes-Verbindung wurde unterbrochen.", "unknown", true));
          else resolve();
        });
      } catch (error) { clearTimeout(timer); reject(error); }
    });
  }

  /** Protokollfehler sperren Aktionen; ein Disconnect darf fremde Arbeit nicht abbrechen. */
  protocolFault(): void {
    this.quarantined = true;
    this.wanted = false;
    clearTimeout(this.retry);
    this.retry = undefined;
    this.setState("incompatible");
    this.rejectPending();
    this.lastPong = Date.now();
    if (!this.options.onProtocolError()) this.socket?.terminate();
  }

  dispose(): void {
    this.disposed = true;
    this.wanted = false;
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    this.retry = undefined;
    this.heartbeat = undefined;
    const socket = this.socket;
    this.socket = null;
    this.endTransport();
    this.rejectPending();
    if (socket) socket.terminate();
    this.setState("offline");
  }

  private async open(): Promise<void> {
    clearTimeout(this.retry);
    this.retry = undefined;
    this.setState(this.attempts ? "reconnecting" : "connecting");
    let token: string;
    try { token = await this.options.token.get(); }
    catch {
      this.scheduleRetry();
      throw new GatewayError("GATEWAY_OFFLINE", "Das Hermes-Dashboard ist nicht erreichbar.", "not_sent", true);
    }
    if (this.disposed) throw new GatewayError("GATEWAY_OFFLINE", "Die Gateway-Verbindung wurde geschlossen.");
    const url = new URL(`http://${this.options.authority}`);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new GatewayError("FORBIDDEN", "Der Hermes-Gateway muss an einer lokalen Adresse liegen.");
    }
    url.protocol = "ws:";
    url.pathname = "/api/ws";
    url.searchParams.set("token", token);
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url, { maxPayload: this.options.policy.upstreamBytes, handshakeTimeout: this.options.policy.rpcTimeoutMs });
      this.socket = socket;
      this.transportId = randomUUID();
      let ready = false;
      const timeout = setTimeout(() => { socket.terminate(); }, this.options.policy.rpcTimeoutMs);
      timeout.unref();
      socket.on("message", (raw: RawData, binary: boolean) => {
        if (this.socket !== socket) return;
        try {
          if (binary || Buffer.byteLength(raw.toString()) > this.options.policy.upstreamBytes) throw protocolError();
          const frame: unknown = JSON.parse(raw.toString());
          const root = z.object({ jsonrpc: z.literal("2.0") }).passthrough().parse(frame);
          if (root.method === "event") {
            const event = parse(eventSchema, root.params);
            if (event.type === "gateway.ready") {
              if (ready) throw protocolError();
              const info = parse(readySchema, event.payload);
              ready = true;
              this.epoch = info.replay_epoch;
              void this.call("client.capabilities", { server_requests: true }).then((value) => {
                parse(z.object({ server_requests: z.array(z.string()).max(100) }), value);
                if (this.socket !== socket || this.disposed) return;
                clearTimeout(timeout);
                this.attempts = 0;
                this.lastPong = Date.now();
                this.startHeartbeat();
                this.setState("online");
                resolve();
              }).catch((error: unknown) => {
                clearTimeout(timeout);
                if (this.socket !== socket || this.disposed) { reject(error); return; }
                if (error instanceof GatewayError && error.code === "GATEWAY_OFFLINE") {
                  socket.terminate();
                  reject(error);
                  return;
                }
                this.protocolFault();
                reject(protocolError());
              });
            } else {
              if (!ready) throw protocolError();
              this.options.onFrame({ kind: "event", event });
            }
          } else if (typeof root.method === "string") {
            this.options.onFrame({ kind: "request", request: parse(requestFrameSchema, frame) });
          } else {
            this.acceptResponse(root);
          }
        } catch {
          clearTimeout(timeout);
          this.protocolFault();
          reject(protocolError());
        }
      });
      socket.on("error", () => { /* close räumt auf, ohne die authentifizierte URL zu protokollieren. */ });
      socket.on("close", (code) => {
        clearTimeout(timeout);
        reject(new GatewayError("GATEWAY_OFFLINE", "Die Hermes-Verbindung wurde unterbrochen.", "not_sent", true));
        if (this.socket !== socket) return;
        this.socket = null;
        this.endTransport();
        clearInterval(this.heartbeat);
        this.heartbeat = undefined;
        this.rejectPending();
        if (code === 4401 || code === 1006) this.options.token.invalidate();
        if (this.state !== "incompatible") this.setState("offline");
        this.scheduleRetry();
      });
    });
  }

  private acceptResponse(root: Record<string, unknown>): void {
    if (typeof root.id !== "number") throw protocolError();
    const entry = this.pending.get(root.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(root.id);
    if (root.error !== undefined) {
      entry.reject(new GatewayError("SESSION_UNAVAILABLE", "Hermes hat die Anfrage abgewiesen.", entry.mutation ? "unknown" : "not_sent", false));
    } else if (root.result !== undefined) {
      entry.resolve(root.result);
    } else {
      entry.reject(protocolError(entry.mutation ? "unknown" : "not_sent"));
    }
  }

  private rejectPending(): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new GatewayError("GATEWAY_OFFLINE", "Die Hermes-Verbindung wurde unterbrochen.", entry.mutation ? "unknown" : "not_sent", true));
    }
    this.pending.clear();
  }

  private scheduleRetry(): void {
    if (!this.wanted || this.disposed || this.retry || this.state === "incompatible") return;
    const delay = Math.min(this.options.policy.retryMaxMs, 500 * 2 ** Math.min(this.attempts++, 6));
    this.retry = setTimeout(() => { this.retry = undefined; void this.connect().catch(() => undefined); }, delay + Math.random() * delay * 0.2);
    this.retry.unref();
  }

  private startHeartbeat(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => {
      const socket = this.socket;
      if (Date.now() - this.lastPong > this.options.policy.heartbeatTimeoutMs) {
        socket?.terminate();
        return;
      }
      void this.call("gateway.ping", {}).then((result) => {
        if (this.socket !== socket || this.disposed) return;
        parse(z.object({ ok: z.literal(true) }), result);
        this.lastPong = Date.now();
      }).catch((error: unknown) => {
        if (this.socket !== socket || this.disposed) return;
        if (error instanceof GatewayError && error.code === "PROTOCOL_MISMATCH") this.protocolFault();
        else socket?.terminate();
      });
    }, this.options.policy.heartbeatMs);
    this.heartbeat.unref();
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.options.onState(state, this.epoch);
  }

  private endTransport(): void {
    const id = this.transportId;
    this.transportId = null;
    if (id) this.options.onTransportClosed(id);
  }
}
