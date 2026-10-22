import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";
import type { GatewayDependencies } from "./types.js";

export interface FakeSession {
  id: string;
  liveId: string;
  cwd: string;
  title: string;
  model: string;
  provider: string;
  running: boolean;
  closeOnDisconnect: boolean;
  seq: number;
  messages: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  requests: Array<{ id: string; method: string; params: Record<string, unknown> }>;
  inflight: Record<string, unknown> | null;
}

/** Nur Testserver mit OS-zugeteiltem Loopback-Port, niemals ein Hermes-Prozess. */
export class FakeGateway {
  readonly sessions = new Map<string, FakeSession>();
  readonly calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  readonly responses: Array<Record<string, unknown>> = [];
  readonly viewers = new Map<WebSocket, Set<string>>();
  readonly server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  readonly token = "dummy-internal-dashboard-token";
  epoch = "epoch-1";
  connections = 0;
  contract: number = 8;
  truncated = false;
  dropSubmit = false;
  dropResponse = false;
  readonly dropReplies = new Set<string>();
  modelConfirmation = false;
  historyHook: (() => void) | null = null;
  responseHook: (() => void) | null = null;
  beforeResumeReply: (() => void) | null = null;
  resultHook: ((method: string, params: Record<string, unknown>, value: unknown) => unknown) | null = null;
  subagents: unknown[] = [];
  processes: unknown[] = [];
  private counter = 0;

  constructor(readonly cwd: string) {
    this.server.on("connection", (socket, request) => {
      if (new URL(request.url ?? "", "http://fake").searchParams.get("token") !== this.token) { socket.close(4401); return; }
      this.connections++;
      this.viewers.set(socket, new Set());
      socket.send(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type: "gateway.ready", payload: { replay_epoch: this.epoch, heartbeat: true, change_events: true } } }));
      socket.on("message", (raw) => {
        const frame = JSON.parse(raw.toString()) as Record<string, unknown>;
        if (typeof frame.method !== "string") {
          if (this.dropResponse) { this.dropResponse = false; socket.terminate(); return; }
          this.responses.push(frame);
          for (const session of this.sessions.values()) session.requests = session.requests.filter((entry) => entry.id !== frame.id);
          this.responseHook?.();
          return;
        }
        const params = frame.params as Record<string, unknown>;
        this.calls.push({ method: frame.method, params });
        if (frame.method === "prompt.submit" && this.dropSubmit) { socket.terminate(); return; }
        const rawResult = this.dispatch(frame.method, params, socket);
        const result = this.resultHook ? this.resultHook(frame.method, params, rawResult) : rawResult;
        if (this.dropReplies.delete(frame.method)) { socket.terminate(); return; }
        socket.send(JSON.stringify({ jsonrpc: "2.0", id: frame.id, result }));
      });
      socket.once("close", () => {
        const viewed = this.viewers.get(socket);
        this.viewers.delete(socket);
        for (const session of this.sessions.values()) {
          if (session.closeOnDisconnect && viewed?.has(session.liveId) && ![...this.viewers.values()].some((ids) => ids.has(session.liveId))) session.running = false;
        }
      });
    });
  }

  async start(): Promise<string> {
    if (!this.server.address()) await once(this.server, "listening");
    const address = this.server.address();
    if (!address || typeof address === "string") throw new Error("Kein Testport");
    return `127.0.0.1:${address.port}`;
  }

  seed(id?: string): FakeSession {
    id ??= `stored-${this.counter + 1}`;
    this.counter++;
    const session: FakeSession = { id, liveId: `live-${this.counter}-${this.epoch}`, cwd: this.cwd, title: "Testsession", model: "model-a", provider: "test", running: false, closeOnDisconnect: true, seq: 0, messages: [], events: [], requests: [], inflight: null };
    this.sessions.set(id, session);
    return session;
  }

  event(session: FakeSession, type: string, payload?: Record<string, unknown>): void {
    if (type === "message.start") session.running = true;
    if (type === "message.complete") session.running = false;
    const event = { type, session_id: session.liveId, seq: ++session.seq, ...(payload ? { payload } : {}) };
    session.events.push(event);
    for (const [socket, viewers] of this.viewers) if (viewers.has(session.liveId) && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ jsonrpc: "2.0", method: "event", params: event }));
  }

  request(session: FakeSession, method: string, params: Record<string, unknown>, id = "srq-test"): void {
    const entry = { id, method, params: { session_id: session.liveId, ...params } };
    session.requests.push(entry);
    for (const [socket, viewers] of this.viewers) if (viewers.has(session.liveId) && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ jsonrpc: "2.0", ...entry }));
  }

  disconnect(newEpoch?: string): void {
    if (newEpoch) {
      this.epoch = newEpoch;
      for (const session of this.sessions.values()) { session.liveId = `live-${++this.counter}-${newEpoch}`; session.seq = 0; session.events = []; session.requests = []; }
    }
    for (const socket of this.server.clients) socket.terminate();
  }

  async close(): Promise<void> {
    for (const socket of this.server.clients) socket.terminate();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  dependencies(authority: string): GatewayDependencies {
    return {
      authority, enabled: () => true, identity: { allowedUsers: ["ben"], developmentUser: "ben" },
      allowedRoots: [this.cwd], resolveProjectCwd: async () => this.cwd,
      dashboard: { token: { get: async () => this.token, invalidate() {} }, get: async (path) => this.read(path) },
      policy: { rpcTimeoutMs: 1_000, retryMaxMs: 10, heartbeatMs: 10_000, idleMs: 10 },
    };
  }

  private read(path: string): unknown {
    const url = new URL(path, "http://fake");
    const [, , , encoded, action] = url.pathname.split("/");
    const id = decodeURIComponent(encoded ?? "");
    const session = this.sessions.get(id);
    if (!session) throw new Error("Keine Testsession");
    if (action === "latest-descendant") return { requested_session_id: id, session_id: id, path: [id] };
    if (action === "messages") {
      const limit = Number(url.searchParams.get("limit") ?? 200);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const end = Math.max(0, session.messages.length - offset);
      const result = { session_id: id, messages: session.messages.slice(Math.max(0, end - limit), end) };
      const hook = this.historyHook;
      this.historyHook = null;
      hook?.();
      return result;
    }
    return { id: session.id, cwd: session.cwd, title: session.title, model: session.model, provider: session.provider };
  }

  private snapshot(session: FakeSession): Record<string, unknown> {
    return {
      session_id: session.liveId, stored_session_id: session.id, session_key: session.id,
      message_count: session.messages.length, messages: [], running: session.running, inflight: session.inflight,
      info: { cwd: session.cwd, desktop_contract: this.contract, model: session.model, provider: session.provider, title: session.title, running: session.running },
      open_requests: session.requests,
    };
  }

  private dispatch(method: string, params: Record<string, unknown>, socket: WebSocket): unknown {
    if (method === "client.capabilities") return { server_requests: ["approval", "clarify", "secret"] };
    if (method === "gateway.ping") return { ok: true };
    if (method === "session.list") return { sessions: [...this.sessions.values()].map((session) => ({ id: session.id, title: session.title, message_count: session.messages.length })) };
    if (method === "session.active_list") return { sessions: [...this.sessions.values()].map((session) => ({ id: session.liveId, session_key: session.id, status: session.running ? "streaming" : "idle", model: session.model })) };
    if (method === "session.create") {
      const session = this.seed();
      session.closeOnDisconnect = params.close_on_disconnect !== false;
      session.cwd = String(params.cwd);
      this.viewers.get(socket)!.add(session.liveId);
      return this.snapshot(session);
    }
    if (method === "model.options") return { provider: "test", model: "model-a", providers: [{ slug: "test", name: "Test", authenticated: true, api_url: "https://secret.invalid", key_env: "SECRET_KEY", models: ["model-a", "model-b"], capabilities: { "model-a": { fast: true, reasoning: false } } }] };
    if (method === "commands.catalog") return { pairs: [["/help", "Hilfe"], ["/secret-quick", "exec: API_KEY=hidden-value"], ["/skill-a", "Skill"]], skills: { "/skill-a": { usage: 1 } }, categories: [{ name: "User commands", pairs: [["/secret-quick", "quick"]] }] };
    const session = [...this.sessions.values()].find((entry) => entry.liveId === params.session_id || entry.id === params.session_id);
    if (!session && method !== "clarify.lock") return {};
    if (method === "clarify.lock") return { status: "ok", remaining: ["q2"] };
    if (method === "session.resume" || method === "session.activate") {
      this.viewers.get(socket)!.add(session!.liveId);
      if (method === "session.resume") {
        const hook = this.beforeResumeReply;
        this.beforeResumeReply = null;
        hook?.();
      }
      return this.snapshot(session!);
    }
    if (method === "session.events.since") return { events: session!.events.filter((event) => Number(event.seq) > Number(params.last_seen ?? 0)).slice(-512), latest_seq: session!.seq, count: session!.events.length, truncated: this.truncated, epoch: this.epoch, open_requests: session!.requests };
    if (method === "prompt.submit") {
      session!.running = true;
      session!.messages.push({ row_id: session!.messages.length + 1, role: "user", text: params.text, timestamp: 1_800_000_000 });
      session!.inflight = { user: params.text, assistant: "", streaming: true };
      return { status: "streaming", user_row_id: session!.messages.length };
    }
    if (method === "session.interrupt") { session!.running = false; return { status: "interrupted" }; }
    if (method === "session.steer") return { status: "queued", text: params.text };
    if (method === "config.set") return { key: "model", value: params.value, confirm_required: this.modelConfirmation && params.confirm_expensive_model !== true, confirm_message: "Modellwechsel bestätigen", deferred: false };
    if (method === "subagent.list") return { subagents: this.subagents };
    if (method === "process.list") return { processes: this.processes };
    return {};
  }
}
