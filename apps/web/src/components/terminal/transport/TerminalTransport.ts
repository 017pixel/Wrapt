import type { ClientMessage, ServerMessage } from "../terminal-types";
import { terminalConnectTimeoutMs, terminalReconnectDelayMs, terminalMaxReconnectDelayMs, terminalHeartbeatIntervalMs, terminalHeartbeatTimeoutMs } from "../terminal-constants";
import { TerminalInputQueue } from "./TerminalInputQueue";

export interface TerminalSubscription {
  runtimeId: string;
  sessionId: string | null;
  /** Sendet eine Nachricht über den gemeinsamen Socket. */
  send(message: ClientMessage): boolean;
  /** Registriert einen Nachrichten-Listener; gibt die Abmeldung zurück. */
  onMessage(listener: (message: ServerMessage) => void): () => void;
  onStatus(listener: (connected: boolean) => void): () => void;
  dispose(): void;
}

interface SubscriptionState {
  runtimeId: string;
  sessionId: string | null;
  clients: Set<SubscriptionClient>;
}

interface SubscriptionClient {
  listeners: Set<(message: ServerMessage) => void>;
  statusListeners: Set<(connected: boolean) => void>;
}

/**
 * Multiplexter Terminal-Transport: Ein Browser-Tab hält genau einen WebSocket
 * und verwaltet darüber beliebig viele Runtime-Subscriptions (Split View,
 * mehrere Panes, geparkte Renderer). Der Server bleibt autoritativ; dieser
 * Client ordnet eingehende Nachrichten über die Runtime-ID zu.
 */
class TerminalTransport {
  private socket: WebSocket | null = null;
  private readonly subscriptions = new Map<string, SubscriptionState>();
  private readonly sessionToRuntime = new Map<string, string>();
  private reconnectTimer: number | null = null;
  private retries = 0;
  private heartbeat: number | null = null;
  private deadline: number | null = null;
  private lastReceived = 0;
  private warmTimer: number | null = null;
  private observing = false;
  private readonly sizes = new Map<string, string>();
  private readonly inputs = new TerminalInputQueue((message) => this.sendNow(message), (sessionIds) => {
    for (const sessionId of sessionIds) this.route({ type: "terminal.error", sessionId, code: "INPUT_NOT_SENT", message: "Die letzte Terminaleingabe wurde unterbrochen. Prüfe den Befehl vor dem erneuten Senden." });
  });

  /** Hover öffnet bereits den Transport, startet aber keine Shell. */
  preconnect(): void {
    if (this.subscriptions.size > 0 || this.warmTimer !== null) return;
    this.warmTimer = window.setTimeout(() => {
      this.warmTimer = null;
      if (this.subscriptions.size === 0) this.closeSocket();
    }, 5_000);
    this.ensureSocket();
  }

  subscribe(runtimeId: string, initial: { sessionId?: string } = {}): TerminalSubscription {
    if (this.warmTimer !== null) window.clearTimeout(this.warmTimer);
    this.warmTimer = null;
    const state = this.subscriptions.get(runtimeId) ?? {
      runtimeId,
      sessionId: initial.sessionId ?? null,
      clients: new Set<SubscriptionClient>(),
    } satisfies SubscriptionState;
    if (initial.sessionId) state.sessionId = initial.sessionId;
    this.subscriptions.set(runtimeId, state);
    if (initial.sessionId) this.sessionToRuntime.set(initial.sessionId, runtimeId);
    const client: SubscriptionClient = { listeners: new Set(), statusListeners: new Set() };
    state.clients.add(client);
    // Den Client vor dem Socket-Aufbau registrieren. So bleibt auch ein
    // synchroner Open-Callback eines Test-/Browser-Transports sichtbar.
    this.ensureSocket();
    let disposed = false;
    return {
      runtimeId,
      sessionId: state.sessionId,
      send: (message) => this.send(message),
      onMessage: (listener) => {
        client.listeners.add(listener);
        return () => client.listeners.delete(listener);
      },
      onStatus: (listener) => {
        client.statusListeners.add(listener);
        // Neue Renderer können hinzukommen, während der gemeinsame Socket
        // bereits offen ist. Ohne den sofortigen Ist-Stand bliebe ihr
        // Create-/Resume-Flow bis zum nächsten Reconnect aus.
        if (this.socket?.readyState === WebSocket.OPEN) listener(true);
        return () => client.statusListeners.delete(listener);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        state.clients.delete(client);
        if (state.clients.size === 0) {
          this.send({ type: "terminal.unsubscribe", runtimeId });
          this.subscriptions.delete(runtimeId);
        }
        // Ein Pane-Wechsel entfernt und ergänzt Abos im selben Commit.
        // Den offenen Socket dafür behalten, ungenutzte danach schließen.
        if (this.subscriptions.size === 0) queueMicrotask(() => {
          if (this.subscriptions.size === 0 && this.warmTimer === null) this.closeSocket();
        });
      },
    };
  }

  private send(message: ClientMessage): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) { this.onWake(); return false; }
    if (message.type === "terminal.input") return this.inputs.enqueue(message);
    this.inputs.flush();
    if (message.type === "terminal.resize") {
      const size = `${message.cols}:${message.rows}`;
      if (this.sizes.get(message.sessionId) === size) return true;
      if (!this.sendNow(message)) return false;
      this.sizes.set(message.sessionId, size);
      return true;
    }
    return this.sendNow(message);
  }

  private sendNow(message: ClientMessage): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try { socket.send(JSON.stringify(message)); return true; }
    catch { this.recover(); return false; }
  }

  private ensureSocket(): void {
    this.observeWake();
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.openSocket();
  }

  private openSocket(): void {
    const url = new URL("/api/v1/terminal", window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url.toString());
    this.socket = socket;
    this.deadline = window.setTimeout(() => this.recover(), terminalConnectTimeoutMs);
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.clearDeadline();
      this.retries = 0;
      this.lastReceived = Date.now();
      this.emitStatus(true);
      this.heartbeat = window.setInterval(() => {
        if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return;
        this.probe(terminalHeartbeatTimeoutMs);
      }, terminalHeartbeatIntervalMs);
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      this.lastReceived = Date.now();
      this.clearDeadline();
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      if (message.type === "terminal.pong") { this.clearDeadline(); return; }
      this.route(message);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.inputs.reset();
      this.sizes.clear();
      this.clearDeadline();
      if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.emitStatus(false);
      if (this.subscriptions.size === 0 && this.warmTimer === null) return;
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        this.openSocket();
      }, Math.min(terminalMaxReconnectDelayMs, terminalReconnectDelayMs * (2 ** this.retries++)));
    };
    socket.onerror = () => socket.close();
  }

  private closeSocket(): void {
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.clearDeadline();
    this.inputs.reset();
    this.sizes.clear();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.sessionToRuntime.clear();
    this.stopObservingWake();
  }

  private probe(timeout: number): void {
    if (this.deadline !== null) return;
    this.deadline = window.setTimeout(() => this.recover(), timeout);
    this.sendNow({ type: "terminal.ping" });
  }

  /** Standby kann einen Socket als OPEN zurücklassen, obwohl TCP schon tot ist. */
  private readonly onWake = (): void => {
    if (document.visibilityState === "hidden") return;
    if (this.socket?.readyState === WebSocket.CONNECTING) return;
    if (this.socket?.readyState !== WebSocket.OPEN || Date.now() - this.lastReceived >= terminalHeartbeatIntervalMs) {
      this.recover();
    } else this.probe(2_000);
  };

  private recover(): void {
    this.closeSocket();
    this.retries = 0;
    this.emitStatus(false);
    if (this.subscriptions.size > 0 || this.warmTimer !== null) this.ensureSocket();
  }

  private observeWake(): void {
    if (this.observing) return;
    this.observing = true;
    for (const event of ["focus", "online", "pageshow"]) window.addEventListener(event, this.onWake);
    document.addEventListener("visibilitychange", this.onWake);
  }

  private stopObservingWake(): void {
    if (!this.observing) return;
    this.observing = false;
    for (const event of ["focus", "online", "pageshow"]) window.removeEventListener(event, this.onWake);
    document.removeEventListener("visibilitychange", this.onWake);
  }

  private clearDeadline(): void {
    if (this.deadline !== null) window.clearTimeout(this.deadline);
    this.deadline = null;
  }

  private route(message: ServerMessage): void {
    if (message.type === "terminal.created") {
      this.sessionToRuntime.set(message.sessionId, message.runtimeId);
    }
    // Fehler tragen nach Möglichkeit eine Runtime-ID (Server); sonst wird über
    // die Session-ID geroutet. Nachrichten ohne beides (Pong) werden verworfen.
    const runtimeId = "runtimeId" in message && typeof (message as { runtimeId?: string }).runtimeId === "string"
      ? (message as { runtimeId: string }).runtimeId
      : "sessionId" in message && typeof message.sessionId === "string"
        ? this.sessionToRuntime.get(message.sessionId)
        : undefined;
    if (!runtimeId) {
      // Authentifizierungs- und Protokollfehler betreffen den ganzen Socket.
      if (message.type === "terminal.error" && !message.sessionId && !message.runtimeId) {
        for (const state of this.subscriptions.values()) for (const client of state.clients) for (const listener of client.listeners) listener(message);
      }
      return;
    }
    // Jede Nachricht, die beide IDs trägt (Snapshot, Deltas, Created),
    // frischt die Session-Zuordnung auf. Ohne das bliebe die Map nach einem
    // Socket-Neuaufbau mit Fast Reconnect (nur Deltas, kein Created) leer und
    // alle reinen Session-Nachrichten (Live-Output, Geometrie) würden still
    // verworfen — getippte Eingaben wären erst nach einem Reload sichtbar.
    if ("sessionId" in message && typeof message.sessionId === "string") {
      this.sessionToRuntime.set(message.sessionId, runtimeId);
    }
    const state = this.subscriptions.get(runtimeId);
    if (!state) return;
    if ("sessionId" in message && typeof message.sessionId === "string") state.sessionId = message.sessionId;
    for (const client of state.clients) {
      for (const listener of client.listeners) listener(message);
    }
  }

  private emitStatus(connected: boolean): void {
    for (const state of this.subscriptions.values()) {
      for (const client of state.clients) {
        for (const listener of client.statusListeners) listener(connected);
      }
    }
  }
}

/** Eine gemeinsame Transport-Instanz pro Browserseite. */
export const terminalTransport = new TerminalTransport();
