import {
  hermesV2ClientMessageSchema, hermesV2EventSchema, hermesV2MessageSchema,
  hermesV2ServerMessageSchema, hermesV2SnapshotSchema,
  type HermesV2ClientMessage, type HermesV2Event, type HermesV2Message,
  type HermesV2ServerMessage, type HermesV2Snapshot,
} from "@wrapt/contracts/hermes-v2";
import { GatewayClient } from "./gateway-client";
import type { GatewaySocket } from "./gateway-protocol";
import type { OperationResult } from "./gateway-protocol";

export function snapshot(id = "a", patch: Partial<HermesV2Snapshot> = {}): HermesV2Snapshot {
  return hermesV2SnapshotSchema.parse({
    session: { id, title: id, preview: "", source: "cli", model: null, provider: null,
      cwd: null, projectId: null, messageCount: 0, updatedAt: null, running: false,
      startedAt: null, draft: false },
    epoch: "epoch", cursor: 0, writable: true, blockedReason: null, selection: null,
    reasoningEffort: null, running: false, turnStartedAt: null, inflight: null,
    queuedText: null, requests: [], messages: [], ...patch,
  });
}
export function row(id: number, text: string, patch: Partial<HermesV2Message> = {}): HermesV2Message {
  return hermesV2MessageSchema.parse({ id: `row:${id}`, rowId: id, role: "assistant", text,
    reasoning: null, timestamp: id, toolId: null, toolName: null, toolStatus: null,
    input: null, displayKind: null, ...patch });
}
export function event(type: HermesV2Event["type"], seq: number | null, payload: unknown,
  sessionId = "a", epoch = "epoch"): HermesV2Event {
  return hermesV2EventSchema.parse({ type, seq, payload, sessionId, epoch });
}
export const completed = (turnId = "turn", text = "fertig", persistedTurn: unknown = null) => ({
  turnId, text, reasoning: null, status: "complete", error: null, recoverable: false, usage: null, persistedTurn,
});
export const inflight = { user: "Frage", assistant: "Alt", streaming: true, displayKind: null,
  displayText: null, corrections: [], error: null, recoverable: false };
export async function settle(): Promise<void> { for (let index = 0; index < 30; index++) await Promise.resolve(); }

export class TestSocket extends EventTarget implements GatewaySocket {
  readyState = 1;
  readonly sent: HermesV2ClientMessage[] = [];
  closes = 0;
  closeReason: string | undefined;
  throwOnSend = false;
  readonly connectionId = crypto.randomUUID();
  bufferedAmount = 0;
  constructor(readonly gateway: TestGateway, readonly url: string) { super(); }
  send(data: string): void {
    const frame = hermesV2ClientMessageSchema.parse(JSON.parse(data));
    this.sent.push(frame);
    if (this.throwOnSend) throw new Error("test send loss");
    this.gateway.receive(frame, this);
  }
  close(_code?: number, reason?: string): void { this.readyState = 3; this.closes++; this.closeReason = reason; }
  receive(frame: unknown): void {
    this.raw(JSON.stringify(hermesV2ServerMessageSchema.parse(frame)));
  }
  raw(data: string): void { this.dispatchEvent(new MessageEvent("message", { data })); }
  drop(code = 1006): void { this.readyState = 3; this.dispatchEvent(new CloseEvent("close", { code })); }
  result(frame: HermesV2ClientMessage, data: unknown): void {
    this.receive({ v: 1, type: "result", id: frame.id, op: frame.op, data });
  }
  event(value: HermesV2Event): void { this.receive({ v: 1, type: "event", event: value }); }
  online(): void { this.receive({ v: 1, type: "connection", state: "online", epoch: "epoch",
    ...(this.gateway.composer && new URL(this.url).searchParams.get("composer") === "1" ? { connectionId: this.connectionId } : {}) }); }
}
export class TestGateway {
  readonly sockets: TestSocket[] = [];
  readonly snapshots = new Map<string, HermesV2Snapshot>();
  readonly pages = new Map<string, HermesV2Message[]>();
  readonly catalogs = new Map<string, OperationResult<"catalog.read">["data"]>();
  composer = false;
  autoOnline = true;
  handle: ((frame: HermesV2ClientMessage, socket: TestSocket) => boolean) | null = null;
  createClient(): GatewayClient {
    return new GatewayClient({ location: () => "https://workbench.test/warp?session=a", random: () => 1,
      socketFactory: (url) => {
        const socket = new TestSocket(this, url);
        this.sockets.push(socket);
        if (this.autoOnline) queueMicrotask(() => { if (socket.readyState === 1) socket.online(); });
        return socket;
      } });
  }
  get socket(): TestSocket { return this.sockets.at(-1)!; }
  get sent(): HermesV2ClientMessage[] { return this.sockets.flatMap((socket) => socket.sent); }
  receive(frame: HermesV2ClientMessage, socket: TestSocket): void {
    if (this.handle?.(frame, socket)) return;
    queueMicrotask(() => {
      if (socket.readyState !== 1) return;
      switch (frame.op) {
        case "sessions.list": socket.result(frame, { sessions: [...this.snapshots.values()].map((entry) => entry.session), hasMore: false }); break;
        case "session.subscribe": socket.result(frame, { snapshot: this.snapshots.get(frame.sessionId) ?? snapshot(frame.sessionId) }); break;
        case "session.unsubscribe": socket.result(frame, { unsubscribed: true }); break;
        case "session.create": socket.result(frame, { snapshot: snapshot("created") }); break;
        case "history.read": {
          const messages = this.pages.get(`${frame.sessionId}:${frame.offset ?? 0}`) ?? [];
          socket.result(frame, { sessionId: frame.sessionId, messages, offset: frame.offset ?? 0,
            returned: messages.length, hasMore: this.pages.has(`${frame.sessionId}:${(frame.offset ?? 0) + messages.length}`) && messages.length > 0 });
          break;
        }
        case "message.submit": socket.result(frame, { status: frame.mode === "queue" ? "queued" : "streaming", userRowId: null }); break;
        case "session.stop": socket.result(frame, { status: "sent" }); break;
        case "session.steer": socket.result(frame, { status: "queued" }); break;
        case "catalog.read": socket.result(frame, this.catalogs.get(frame.sessionId) ?? { commands: [], models: { providers: [], current: null } }); break;
        case "model.select": socket.result(frame, { selection: frame.selection, deferred: false, confirmation: null }); break;
        case "session.title": socket.result(frame, { title: frame.title, pending: false }); break;
        case "reasoning.select": socket.result(frame, { requested: frame.effort, observation: "observed", observed: {
          reasoning: { effort: frame.effort, wire: frame.effort }, approvals: { mode: "manual", scope: "global", editable: false, effectiveBypass: false },
        } }); break;
        case "request.respond": socket.result(frame, { status: "sent" }); break;
        case "request.lock": socket.result(frame, { remaining: [], settled: true }); break;
        case "subagents.read": socket.result(frame, { subagents: [], background: [] }); break;
        case "work.read": socket.result(frame, { revision: 0, subagents: [], delegations: [], processes: [], tasks: [],
          queuedText: this.snapshots.get(frame.sessionId)?.queuedText ?? null, coverage: { subagents: "live-and-observed", delegations: "recent-failures-partial",
            processes: "session", tasks: "observed-partial", queue: "next-only", truncated: false } }); break;
      }
    });
  }
}
export type ServerFrame = HermesV2ServerMessage;
