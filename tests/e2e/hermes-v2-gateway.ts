import { randomUUID } from "node:crypto";
import { HermesV2BrowserOrganization } from "./hermes-v2-organization";
import { HermesV2BrowserRequests } from "./hermes-v2-requests";
import { HermesV2BrowserComposer } from "./hermes-v2-composer";
import { HermesV2BrowserAttachments } from "./hermes-v2-attachments";
import { HermesV2BrowserWork, isBrowserWorkOperation } from "./hermes-v2-work";
import { HermesV2BrowserResources } from "./hermes-v2-resources";
import type { BrowserContext, WebSocketRoute } from "@playwright/test";
import {
  hermesV2ClientMessageSchema, hermesV2EventSchema, hermesV2ServerMessageSchema,
  type HermesV2ClientMessage, type HermesV2Event, type HermesV2Message, type HermesV2ServerMessage,
  type HermesV2Session, type HermesV2Snapshot,
} from "../../packages/contracts/src/hermes-v2";

interface Viewer { socket: WebSocketRoute; sessions: Set<string>; id: string; composer: boolean; work: boolean; resources: boolean }
interface Story { snapshot: HermesV2Snapshot; history: HermesV2Message[]; turnId: string | null; userRowId: number | null }
type Result = Extract<HermesV2ServerMessage, { type: "result" }>;
type Reply = { [Op in Result["op"]]: Omit<Extract<Result, { op: Op }>, "v" | "type" | "id"> }[Result["op"]];

/** Browserfixture mit geprüften öffentlichen Frames; verbindet sich nie mit echtem Hermes. */
export class HermesV2BrowserGateway {
  readonly calls: Array<{ op: HermesV2ClientMessage["op"]; sessionId: string | null; mode?: "normal" | "queue" }> = [];
  readonly stories = new Map<string, Story>();
  readonly viewers = new Set<Viewer>();
  readonly organization = new HermesV2BrowserOrganization(this);
  readonly requests = new HermesV2BrowserRequests(this);
  readonly composer = new HermesV2BrowserComposer(this);
  readonly attachments = new HermesV2BrowserAttachments(this);
  readonly work = new HermesV2BrowserWork(this);
  readonly resources = new HermesV2BrowserResources(this);
  autoComplete = true;
  steerStatus: "queued" | "redirected" | "rejected" = "queued";
  loseNextSubmitResult = false;
  holdSubmitResults = false;
  private submitResults: Array<() => void> = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private counter = 0;

  seed(id = "stored-browser", title = "Browser-Testsession"): HermesV2Snapshot {
    const session: HermesV2Session = {
      id, title, preview: "", source: "web", model: "browser-model", provider: "test",
      cwd: "/testprojekt", projectId: null, messageCount: 0, updatedAt: 1_800_000_000_000,
      running: false, startedAt: 1_800_000_000_000, draft: false,
    };
    const snapshot: HermesV2Snapshot = {
      session, epoch: "browser-epoch", cursor: 0, writable: true, blockedReason: null,
      selection: { model: "browser-model", provider: "test" }, reasoningEffort: null,
      running: false, turnStartedAt: null, inflight: null, queuedText: null,
      requests: [], messages: [],
    };
    this.stories.set(id, { snapshot, history: [], turnId: null, userRowId: null });
    return snapshot;
  }

  seedHistory(sessionId: string, count: number): void {
    const story = this.story(sessionId);
    story.history = Array.from({ length: count }, (_, index) => this.row(index + 1,
      index % 2 ? "assistant" : "user", `Gespeicherte Nachricht ${index + 1}`));
    this.updateHistory(story);
  }

  async install(context: BrowserContext): Promise<void> {
    await this.organization.install(context);
    await this.attachments.install(context);
    await this.resources.install(context);
    // Andere Workbench-Features gehören nicht zum Hermes-Fixture. Insbesondere
    // darf Playwright keine späte Welcome-Message in einen bereits geschlossenen
    // Editor-Bridge-Socket zustellen und daraus einen künstlichen Pageerror machen.
    await context.routeWebSocket("**/api/v1/editor/ws", () => {});
    await context.routeWebSocket("**/api/v1/notifications/ws", () => {});
    await context.routeWebSocket("**/api/v1/hermes/v2/gateway*", (socket) => {
      const viewer: Viewer = { socket, sessions: new Set(), id: randomUUID(),
        composer: new URL(socket.url()).searchParams.get("composer") === "1",
        work: new URL(socket.url()).searchParams.get("work") === "1",
        resources: new URL(socket.url()).searchParams.get("resources") === "1" };
      this.viewers.add(viewer);
      socket.onClose(() => this.viewers.delete(viewer));
      socket.onMessage((raw) => this.receive(viewer, raw));
      this.send(viewer, { v: 1, type: "connection", state: "online", epoch: "browser-epoch",
        ...(viewer.composer ? { connectionId: viewer.id } : {}) });
    });
  }

  emit(sessionId: string, type: HermesV2Event["type"], payload: unknown): void {
    const story = this.story(sessionId);
    const event = hermesV2EventSchema.parse({
      sessionId, epoch: story.snapshot.epoch, seq: ++story.snapshot.cursor, type, payload,
    });
    for (const viewer of this.viewers) if (viewer.sessions.has(sessionId)
      && (!type.startsWith("work.") || viewer.work)) this.send(viewer, { v: 1, type: "event", event });
  }

  metadataChanged(sessionId: string, revision: number): void {
    const event = hermesV2EventSchema.parse({ sessionId, epoch: "browser-epoch", seq: null,
      type: "metadata.invalidated", payload: { sessionId, revision } });
    for (const viewer of this.viewers) this.send(viewer, { v: 1, type: "event", event });
  }

  delta(sessionId: string, text: string): void {
    const story = this.story(sessionId);
    if (story.snapshot.inflight) story.snapshot.inflight.assistant += text;
    this.emit(sessionId, "message.delta", { turnId: story.turnId, text });
  }

  complete(sessionId: string, text: string, status = "completed", readEvidence?: string): void {
    const story = this.story(sessionId);
    const rowId = story.history.length + 1;
    story.history.push({ ...this.row(rowId, "assistant", text), ...(readEvidence ? { readEvidence } : {}) });
    this.updateHistory(story);
    story.snapshot.running = false;
    story.snapshot.session.running = false;
    story.snapshot.inflight = null;
    this.emit(sessionId, "message.completed", {
      turnId: story.turnId, text, reasoning: null, status, error: null, recoverable: false,
      usage: { input: 10, output: 5, reasoning: 0, contextUsed: 15, contextMax: 100_000, costUsd: null },
      persistedTurn: { userRowId: story.userRowId, assistantRowId: rowId, complete: true },
      ...(readEvidence ? { readEvidence } : {}),
    });
  }

  async disconnect(): Promise<void> {
    await Promise.all([...this.viewers].map(({ socket }) => socket.close({ code: 1012, reason: "Test-Reconnect" })));
  }

  dispose(): void {
    this.submitResults = [];
    this.composer.dispose();
    this.attachments.dispose();
    this.work.dispose();
    this.resources.dispose();
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.requests.dispose();
  }

  private receive(viewer: Viewer, raw: string | Buffer): void {
    const message = hermesV2ClientMessageSchema.parse(JSON.parse(raw.toString()));
    this.calls.push({ op: message.op, sessionId: "sessionId" in message ? message.sessionId : null,
      ...(message.op === "message.submit" ? { mode: message.mode ?? "normal" } : {}) });
    const reply = (value: Reply) => {
      this.send(viewer, { ...value, v: 1, type: "result", id: message.id } as Result);
    };
    if (message.op === "sessions.list") {
      const query = message.query?.toLocaleLowerCase() ?? "";
      const sessions = [...this.stories.values()].map(({ snapshot }) => snapshot.session)
        .filter((session) => `${session.title} ${session.id} ${session.cwd}`.toLocaleLowerCase().includes(query));
      reply({ op: message.op, data: { sessions: sessions.slice(0, message.limit ?? 50), hasMore: sessions.length > (message.limit ?? 50) } });
      return;
    }
    if (message.op === "session.create") {
      const snapshot = this.seed(`stored-created-${++this.counter}`, message.title ?? "Neue Sitzung");
      snapshot.session.draft = true;
      snapshot.session.projectId = message.projectId;
      if (viewer.composer) this.composer.seed(snapshot.session.id);
      viewer.sessions.add(snapshot.session.id);
      reply({ op: message.op, data: { snapshot } });
      return;
    }
    const story = this.stories.get(message.sessionId);
    if (!story) {
      this.send(viewer, { v: 1, type: "error", id: message.id, code: "SESSION_NOT_FOUND", message: "Testsession nicht gefunden.", retryable: false, outcome: "not_sent" });
      return;
    }
    if (message.op === "request.respond" || message.op === "request.lock") {
      this.requests.handle(message, (result) => this.send(viewer, result), (code) => {
        this.send(viewer, { v: 1, type: "error", id: message.id, code,
          message: code === "STALE_REQUEST" ? "Diese Testanfrage ist nicht mehr offen." : "Eine andere Testfläche antwortet bereits.",
          retryable: false, outcome: "not_sent" });
      }, () => { void viewer.socket.close({ code: 1012, reason: "Unbekannter Testantwortausgang" }); });
    } else if (message.op === "session.subscribe") {
      viewer.sessions.add(message.sessionId);
      reply({ op: message.op, data: { snapshot: story.snapshot } });
    } else if (message.op === "session.unsubscribe") {
      viewer.sessions.delete(message.sessionId);
      reply({ op: message.op, data: { unsubscribed: true } });
    } else if (message.op === "history.read") {
      const offset = message.offset ?? 0;
      const limit = message.limit ?? 200;
      const end = Math.max(0, story.history.length - offset);
      const messages = story.history.slice(Math.max(0, end - limit), end);
      reply({ op: message.op, data: { sessionId: message.sessionId, messages, offset, returned: messages.length, hasMore: end > limit } });
    } else if (message.op === "message.submit") {
      this.submit(viewer, message, story, reply);
    } else if (message.op === "session.stop") {
      const running = story.snapshot.running;
      if (running) this.complete(message.sessionId, story.snapshot.inflight?.assistant ?? "", "interrupted");
      reply({ op: message.op, data: { status: running ? "interrupted" : "not_interrupted" } });
    } else if (message.op === "session.steer") {
      reply({ op: message.op, data: { status: this.steerStatus } });
    } else if (isBrowserWorkOperation(message)) {
      this.work.handle(message, (frame) => this.send(viewer, frame), (code, outcome, detail) => {
        this.send(viewer, { v: 1, type: "error", id: message.id, code, outcome,
          message: detail, retryable: false });
      }, () => { void viewer.socket.close({ code: 1012, reason: "Unbekannter Testaufgabenausgang" }); }, viewer.work);
    } else if (message.op === "catalog.read" || message.op === "model.select"
      || message.op === "reasoning.select" || message.op === "session.title") {
      this.composer.handle(message,
        (frame) => this.send(viewer, frame), () => this.send(viewer, { v: 1, type: "error", id: message.id,
          code: "SESSION_UNAVAILABLE", message: "Diese Testaktion ist im aktuellen Zustand nicht verfügbar.",
          retryable: false, outcome: "not_sent" }), viewer.composer);
    } else {
      this.send(viewer, { v: 1, type: "error", id: message.id, code: "OPERATION_FAILED", message: "Diese Testaktion wurde nicht vorbereitet.", retryable: false, outcome: "not_sent" });
    }
  }

  private submit(viewer: Viewer, message: Extract<HermesV2ClientMessage, { op: "message.submit" }>, story: Story,
    reply: (value: Reply) => void): void {
    const attachments = this.attachments.forSubmit(message.sessionId, message.attachmentIds);
    if (!attachments) {
      this.send(viewer, { v: 1, type: "error", id: message.id, code: "SESSION_UNAVAILABLE",
        message: "Die Testdatei gehört nicht zu dieser Sitzung oder ist abgelaufen.", retryable: false, outcome: "not_sent" });
      return;
    }
    this.attachments.submissions.push({ sessionId: message.sessionId, ids: [...message.attachmentIds ?? []],
      wireBytes: Buffer.byteLength(JSON.stringify(message)) });
    if (story.snapshot.running && message.mode === "queue") {
      // Der Core quittiert das Einreihen ohne Rowreceipt. Ein weiterer Eintrag
      // ersetzt nicht den bereits vorhandenen nächsten Kopf.
      story.snapshot.queuedText ??= message.text;
      this.work.invalidate(message.sessionId, "queue");
      if (this.loseNextSubmitResult) {
        this.loseNextSubmitResult = false;
        void viewer.socket.close({ code: 1012, reason: "Verlorene Testqueueantwort" });
        return;
      }
      const accepted = () => reply({ op: message.op, data: { status: "queued", userRowId: null } });
      if (this.holdSubmitResults) this.submitResults.push(accepted);
      else accepted();
      return;
    }
    story.turnId = randomUUID();
    const userRowId = story.history.length + 1;
    story.userRowId = userRowId;
    story.history.push({ ...this.row(userRowId, "user", message.text), ...(attachments.length > 0 ? { attachments } : {}) });
    this.updateHistory(story);
    story.snapshot.session.draft = false;
    story.snapshot.running = true;
    story.snapshot.session.running = true;
    story.snapshot.turnStartedAt = Date.now();
    story.snapshot.inflight = { user: message.text, assistant: "", streaming: true, displayKind: null, displayText: null, corrections: [], error: null, recoverable: false };
    this.emit(message.sessionId, "message.started", { turnId: story.turnId });
    if (this.loseNextSubmitResult) {
      this.loseNextSubmitResult = false;
      void viewer.socket.close({ code: 1012, reason: "Verlorene Testantwort" });
    } else {
      const userRowId = story.userRowId;
      const accepted = () => reply({ op: message.op, data: { status: "streaming", userRowId } });
      if (this.holdSubmitResults) this.submitResults.push(accepted);
      else accepted();
    }
    if (this.autoComplete) {
      const turnId = story.turnId;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        if (!story.snapshot.running || story.turnId !== turnId) return;
        this.delta(message.sessionId, "Native Antwort aus dem Browser-Test.");
        this.complete(message.sessionId, "Native Antwort aus dem Browser-Test.");
      }, 60);
      this.timers.add(timer);
    }
  }

  private row(rowId: number, role: HermesV2Message["role"], text: string): HermesV2Message {
    return { id: `row:${rowId}`, rowId, role, text, reasoning: null, timestamp: Date.now(), toolId: null, toolName: null, toolStatus: null, input: null, displayKind: null };
  }

  finishSubmitResults(): void {
    for (const finish of this.submitResults.splice(0)) finish();
  }

  private updateHistory(story: Story): void {
    story.snapshot.messages = story.history.slice(-200);
    story.snapshot.session.messageCount = story.history.length;
    story.snapshot.hasOlder = story.history.length > story.snapshot.messages.length;
  }

  private story(id: string): Story {
    const story = this.stories.get(id);
    if (!story) throw new Error("Unbekannte eigene Browser-Testsession.");
    return story;
  }

  private send(viewer: Viewer, message: HermesV2ServerMessage): void {
    viewer.socket.send(JSON.stringify(hermesV2ServerMessageSchema.parse(message)));
  }
}
