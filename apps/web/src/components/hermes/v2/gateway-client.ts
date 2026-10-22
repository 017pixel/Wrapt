import { hermesV2ClientMessageSchema, hermesV2ServerMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { chatPolicy } from "./chat-policy";
import type { ChatConnectionView } from "./chat-types";
import { ChatError, isMutation, isPriority, type GatewayOperation, type GatewaySocket, type OperationResult } from "./gateway-protocol";
import { GatewayPending } from "./gateway-pending";

export interface GatewayClientOptions {
  socketFactory?: (url: string) => GatewaySocket;
  location?: () => string;
  random?: () => number;
}
interface ReadyWaiter {
  resolve: () => void;
  reject: (error: ChatError) => void;
  timer: ReturnType<typeof setTimeout>;
}
export class GatewayClient {
  private socket: GatewaySocket | null = null;
  private detach: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<(frame: HermesV2ServerMessage, generation: number) => void>();
  private stateListeners = new Set<() => void>();
  private waiters = new Set<ReadyWaiter>();
  private pending = new GatewayPending(() => this.checkRotation());
  private enabled = false;
  private blocked = false;
  private rotating = false;
  private operations = 0;
  private attempt = 0;
  private evidenceEnabled = false;
  private socketEvidence = false;
  private composerEnabled = false;
  private workEnabled = false;
  private resourcesEnabled = false;
  private composerBinding: { id: string; epoch: string; generation: number } | null = null;
  generation = 0;
  private state: ChatConnectionView = { state: "idle", attempt: 0, error: null };

  constructor(private readonly options: GatewayClientOptions = {}) {}
  getSnapshot = (): ChatConnectionView => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  };
  onFrame(listener: (frame: HermesV2ServerMessage, generation: number) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  start(): void {
    this.enabled = true;
    if (!this.socket && !this.blocked && !this.retryTimer) this.open();
  }
  enableReadEvidence(): void { this.evidenceEnabled = true; }
  enableComposer(): void { this.composerEnabled = true; }
  enableWork(): void { this.workEnabled = true; }
  enableResources(): void { this.resourcesEnabled = true; }
  getComposerBinding() { return this.composerBinding; }
  activateReadEvidence(): void {
    if (this.enabled && this.socket && this.evidenceEnabled && !this.socketEvidence) { this.rotating = true; this.checkRotation(); }
  }
  ready(priority = false): Promise<void> {
    if (!this.enabled || this.blocked) return Promise.reject(new ChatError("GATEWAY_OFFLINE", "Hermes ist nicht verbunden."));
    if (this.state.state === "online" && this.socket?.readyState === 1) {
      if (priority && this.operations < chatPolicy.maxOperations) return Promise.resolve();
      if (this.operations < chatPolicy.rotateAt && !this.rotating) return Promise.resolve();
      this.rotating = true;
      this.checkRotation();
    }
    return new Promise((resolve, reject) => {
      const waiter: ReadyWaiter = { resolve, reject, timer: setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new ChatError("GATEWAY_OFFLINE", "Hermes ist noch nicht bereit."));
      }, chatPolicy.readyTimeoutMs) };
      this.waiters.add(waiter);
    });
  }
  request<O extends GatewayOperation["op"]>(operation: Extract<GatewayOperation, { op: O }>): Promise<OperationResult<O>> {
    const priority = isPriority(operation.op);
    if (!this.enabled || this.blocked || this.socket?.readyState !== 1 || this.state.state !== "online") {
      return Promise.reject(new ChatError("GATEWAY_OFFLINE", "Hermes ist nicht verbunden."));
    }
    if (this.operations >= (priority ? chatPolicy.maxOperations : chatPolicy.rotateAt)
      || this.pending.size >= (priority ? chatPolicy.maxPending : chatPolicy.ordinaryPending)) {
      this.rotating = this.operations >= chatPolicy.rotateAt;
      this.checkRotation();
      return Promise.reject(new ChatError("CLIENT_BUSY", "Die Verbindung wird erneuert. Bitte kurz warten."));
    }
    const parsed = hermesV2ClientMessageSchema.safeParse({ ...operation, v: 1, id: crypto.randomUUID() });
    if (!parsed.success) return Promise.reject(new ChatError("INVALID_MESSAGE", "Diese Hermes-Aktion ist ungültig."));
    const data = JSON.stringify(parsed.data);
    const bytes = new TextEncoder().encode(data).byteLength;
    if (bytes > chatPolicy.maxSendBytes) {
      return Promise.reject(new ChatError("PAYLOAD_TOO_LARGE", "Die Hermes-Nachricht ist zu groß."));
    }
    if ((this.socket.bufferedAmount ?? 0) + bytes > chatPolicy.maxBufferedSendBytes) {
      return Promise.reject(new ChatError("CLIENT_BUSY", "Die Übertragung ist ausgelastet. Bitte kurz warten."));
    }
    return new Promise((resolve, reject) => {
      this.pending.add(parsed.data.id, parsed.data.op, (result) => resolve(result as OperationResult<O>), reject);
      this.operations++;
      try { this.socket!.send(data); }
      catch { this.pending.reject(parsed.data.id, new ChatError("SEND_FAILED", "Die Übertragung ist unklar.", isMutation(parsed.data.op) ? "unknown" : "not_sent")); }
      if (this.operations >= chatPolicy.rotateAt) this.rotating = true;
      this.checkRotation();
    });
  }
  reconnect(): void {
    this.blocked = false;
    this.enabled = true;
    this.attempt = 0;
    this.clearRetry();
    this.closeSocket("Die Verbindung wird erneut aufgebaut.", "v2-reconnect");
    this.open();
  }
  failProtocol(): void {
    this.block("PROTOCOL_MISMATCH", "Die Hermes-Antwort gehört nicht zur angeforderten Sitzung.");
  }
  dispose(reason: "v2-disabled" | "v2-navigation" = "v2-navigation"): void {
    this.enabled = false;
    this.clearRetry();
    this.closeSocket(reason === "v2-disabled" ? "Hermes V2 wurde deaktiviert." : "Die Hermes-Fläche wurde geschlossen.", reason);
    this.rejectWaiters("Hermes ist nicht verbunden.");
    this.update({ state: "idle", attempt: 0, error: null });
  }
  private open(): void {
    if (!this.enabled || this.blocked) return;
    this.generation++;
    this.operations = 0;
    this.rotating = false;
    const generation = this.generation;
    this.update({ state: this.attempt ? "reconnecting" : "connecting", attempt: this.attempt, error: null });
    try {
      const url = new URL("/api/v1/hermes/v2/gateway", this.options.location?.() ?? window.location.href);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("origin");
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      if (this.evidenceEnabled) url.searchParams.set("readEvidence", "1");
      if (this.composerEnabled) url.searchParams.set("composer", "1");
      if (this.workEnabled) url.searchParams.set("work", "1");
      if (this.resourcesEnabled) url.searchParams.set("resources", "1");
      this.socketEvidence = this.evidenceEnabled;
      const socket = (this.options.socketFactory ?? ((address) => new WebSocket(address)))(url.href);
      this.socket = socket;
      const receive: EventListener = (event) => { if (generation === this.generation && this.socket === socket) this.receive((event as MessageEvent<unknown>).data); };
      const close: EventListener = (event) => {
        if (generation !== this.generation || this.socket !== socket) return;
        this.closeSocket("Die Verbindung zu Hermes wurde unterbrochen.");
        if ((event as CloseEvent).code === 1008) this.block("FORBIDDEN", "Die Hermes-Verbindung wurde abgewiesen.");
        else this.retry();
      };
      socket.addEventListener("message", receive);
      socket.addEventListener("close", close);
      this.detach = () => {
        socket.removeEventListener("message", receive);
        socket.removeEventListener("close", close);
      };
      this.handshakeTimer = setTimeout(() => {
        if (generation !== this.generation || this.socket !== socket) return;
        this.closeSocket("Hermes hat die Verbindung nicht bestätigt.");
        this.retry();
      }, chatPolicy.readyTimeoutMs);
    } catch { this.retry(); }
  }
  private receive(data: unknown): void {
    const generation = this.generation;
    if (typeof data !== "string" || new TextEncoder().encode(data).byteLength > chatPolicy.maxFrameBytes) {
      this.block("PROTOCOL_MISMATCH", "Die Hermes-Antwort ist nicht kompatibel.");
      return;
    }
    let value: unknown;
    try { value = JSON.parse(data); }
    catch { this.block("PROTOCOL_MISMATCH", "Die Hermes-Antwort ist nicht kompatibel."); return; }
    const parsed = hermesV2ServerMessageSchema.safeParse(value);
    if (!parsed.success) { this.block("PROTOCOL_MISMATCH", "Die Hermes-Antwort ist nicht kompatibel."); return; }
    const frame = parsed.data;
    if (frame.type === "connection") {
      const previousBinding = this.composerBinding;
      if (previousBinding && frame.state === "online" && (frame.epoch !== previousBinding.epoch || frame.connectionId !== previousBinding.id)) {
        this.pending.failAll("CONNECTION_CLOSED", "Der Hermes-Verbindungskontext wurde geändert.");
      }
      this.composerBinding = this.composerEnabled && frame.state === "online" && frame.connectionId && frame.epoch
        ? { id: frame.connectionId, epoch: frame.epoch, generation: this.generation } : null;
      if (frame.state === "incompatible") { this.block("PROTOCOL_MISMATCH", "Der Hermes-Vertrag ist nicht kompatibel."); return; }
      if (frame.state !== "online" && this.state.state === "online") {
        this.pending.failAll("CONNECTION_CLOSED", "Die Verbindung zu Hermes wurde unterbrochen.");
      }
      if (frame.state === "online") this.attempt = 0;
      this.update({ state: frame.state, attempt: this.attempt, error: null });
      if (frame.state === "online") {
        if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
        this.resolveWaiters();
      }
    } else if (frame.type === "result") {
      if (!this.pending.result(frame)) { this.block("PROTOCOL_MISMATCH", "Die Hermes-Antwort passt nicht zur Aktion."); return; }
    } else if (frame.type === "error") {
      if (frame.id) this.pending.reject(frame.id, new ChatError(frame.code, frame.message, frame.outcome));
      if (["PROTOCOL_MISMATCH", "FORBIDDEN"].includes(frame.code)) { this.block(frame.code, frame.message); return; }
    }
    for (const listener of this.listeners) listener(frame, generation);
  }
  private update(state: ChatConnectionView): void {
    this.state = state;
    for (const listener of this.stateListeners) listener();
  }
  private checkRotation(): void {
    if (!this.rotating || !this.enabled || this.pending.mutations > 0) return;
    this.closeSocket("Die Hermes-Verbindung wird erneuert.", "v2-rotation");
    this.open();
  }
  private closeSocket(message: string, reason = "wrapt-client"): void {
    this.composerBinding = null;
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
    this.detach?.();
    this.detach = null;
    const socket = this.socket;
    this.socket = null;
    this.generation++;
    this.pending.failAll("CONNECTION_CLOSED", message);
    if (socket && socket.readyState < 2) socket.close(1000, reason);
  }
  private retry(): void {
    if (!this.enabled || this.blocked) return;
    if (this.attempt >= chatPolicy.maxRetries) { this.block("GATEWAY_OFFLINE", "Hermes ist nicht erreichbar. Erneut verbinden."); return; }
    this.attempt++;
    this.update({ state: "reconnecting", attempt: this.attempt, error: null });
    const delay = Math.min(chatPolicy.retryMaxMs, chatPolicy.retryInitialMs * 2 ** (this.attempt - 1));
    this.clearRetry();
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.open(); }, delay * (0.75 + (this.options.random?.() ?? Math.random()) * 0.25));
  }
  private block(code: string, message: string): void {
    this.blocked = true;
    this.clearRetry();
    this.closeSocket(message);
    this.rejectWaiters(message);
    this.update({ state: code === "PROTOCOL_MISMATCH" ? "incompatible" : "offline", attempt: this.attempt, error: { code, message, outcome: "not_sent" } });
  }
  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
  private resolveWaiters(): void {
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.resolve(); }
    this.waiters.clear();
  }
  private rejectWaiters(message: string): void {
    for (const waiter of this.waiters) { clearTimeout(waiter.timer); waiter.reject(new ChatError("GATEWAY_OFFLINE", message)); }
    this.waiters.clear();
  }
}
