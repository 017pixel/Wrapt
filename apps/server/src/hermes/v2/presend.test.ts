import { WebSocket } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayError } from "./errors.js";
import { clientMessage as message, securityFixture, type SecurityFixture } from "./security-test.fixture.js";

describe("Bewiesene Vorsendfehler und Claimtoken", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { vi.restoreAllMocks(); await f.close(); });

  function failSend(target: string, afterAcceptance = false, callbackFailure = false) {
    const socket: unknown = Reflect.get(f.manager.upstream, "socket");
    if (!(socket instanceof WebSocket)) throw new Error("Testsocket fehlt");
    const original = socket.send.bind(socket);
    return vi.spyOn(socket, "send").mockImplementation((data, options, callback) => {
      const frame = JSON.parse(String(data)) as { method?: string; id?: string };
      const matches = frame.method === target || frame.id === target;
      const done = typeof options === "function" ? options : callback;
      if (matches && !afterAcceptance && !callbackFailure) throw new Error("FAKE_PRE_SEND");
      original(data, typeof options === "object" ? options : {}, matches && callbackFailure ? () => done?.(new Error("FAKE_WRITE_CALLBACK")) : done);
      if (matches && afterAcceptance) throw new Error("FAKE_AFTER_SEND");
    });
  }

  async function subscribe() {
    const session = f.gateway.seed("presend");
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    return session;
  }

  async function openRequest(kind = "approval") {
    const session = await subscribe();
    f.gateway.request(session, kind, kind === "clarify" ? { questions: [{ qid: "q1", question: "Welche?" }] } : { choices: ["once", "deny"] });
    await expect.poll(() => f.manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    return { session, request: f.manager.sessions.records.get(session.id)!.snapshot.requests[0]! };
  }

  it("Submit vor Annahme bleibt not_sent und erfordert einen bewussten neuen Versuch", async () => {
    const session = await subscribe();
    const rejected = failSend("prompt.submit");
    const body = { op: "message.submit", sessionId: session.id, text: "Bewusster Versuch" };
    await f.manager.handle("tab", message(body));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.gateway.calls.some((entry) => entry.method === "prompt.submit")).toBe(false);
    expect(session.running).toBe(false);
    expect(f.manager.sessions.protection.active).toBe(false);
    rejected.mockRestore();
    await f.manager.handle("tab", message(body));
    expect(f.gateway.calls.filter((entry) => entry.method === "prompt.submit")).toHaveLength(1);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "message.submit" });
  });

  it.each(["send", "serialization"] as const)("Create gibt bei %s-Vorsendfehler Reservierung und maxSessions-Kapazität frei", async (kind) => {
    await f.close();
    f = await securityFixture({ maxSessions: 1 });
    await f.manager.handle("tab", message({ op: "sessions.list" }));
    const call = f.manager.upstream.call.bind(f.manager.upstream);
    const rejected = kind === "send" ? failSend("session.create") : vi.spyOn(f.manager.upstream, "call").mockImplementation((method, params, mutation) =>
      call(method, method === "session.create" ? { ...params, toJSON() { throw new Error("FAKE_SERIALIZATION"); } } : params, mutation));
    await f.manager.handle("tab", message({ op: "session.create", projectId: null }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.gateway.sessions.size).toBe(0);
    expect(f.manager.sessions.protection.active).toBe(false);
    expect(f.manager.retainRuntime).toBe(false);
    rejected.mockRestore();
    await f.manager.handle("tab", message({ op: "session.create", projectId: null }));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "session.create" });
    expect(f.gateway.sessions.size).toBe(1);
  });

  it("Flag-off nach bewiesenem Create-Vorsendfehler hält keinen identitätslosen Schutzsocket", async () => {
    await f.manager.handle("tab", message({ op: "sessions.list" }));
    failSend("session.create");
    await f.manager.handle("tab", message({ op: "session.create", projectId: null }));
    f.manager.release("tab", "v2-disabled");
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
    expect(f.manager.retainRuntime).toBe(false);
  });

  it("Clarify-Lock löst bei bewiesenem Vorsendfehler nur seinen Claim und erlaubt bewussten Retry", async () => {
    const { session, request } = await openRequest("clarify");
    const rejected = failSend("clarify.lock");
    const body = { op: "request.lock", sessionId: session.id, requestKey: request.key, epoch: request.epoch, questionId: "q1", answer: "A" };
    await f.manager.handle("tab", message(body));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.gateway.calls.some((entry) => entry.method === "clarify.lock")).toBe(false);
    rejected.mockRestore();
    await f.manager.handle("tab", message(body));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "request.lock" });
    expect(f.gateway.calls.filter((entry) => entry.method === "clarify.lock")).toHaveLength(1);
  });

  it.each(["send", "known-not-sent", "serialization"] as const)("Response gibt bei %s den eigenen Claim frei", async (kind) => {
    const { session, request } = await openRequest();
    const respond = f.manager.upstream.respond.bind(f.manager.upstream);
    const rejected = kind === "send" ? failSend("srq-test") : vi.spyOn(f.manager.upstream, "respond").mockImplementation((id, result) => {
      if (kind === "known-not-sent") throw new GatewayError("GATEWAY_OFFLINE", "Fake vor Send.", "not_sent");
      return respond(id, { ...result, toJSON() { throw new Error("FAKE_SERIALIZATION"); } });
    });
    const body = { op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } };
    await f.manager.handle("tab", message(body));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "not_sent" });
    expect(f.gateway.responses).toHaveLength(0);
    rejected.mockRestore();
    await f.manager.handle("tab", message(body));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "request.respond" });
    expect(f.gateway.responses).toHaveLength(1);
  });

  it("ein verspäteter not_sent-Responsefehler löst keinen inzwischen neueren Claim", async () => {
    const { session, request } = await openRequest();
    const context = f.manager.requestContext(f.manager.sessions.records.get(session.id)!, "tab", request.epoch);
    const claim = f.pool.registry.claim.bind(f.pool.registry);
    let oldToken = "";
    let newToken = "";
    vi.spyOn(f.pool.registry, "claim").mockImplementation((...args) => {
      const answer = claim(...args);
      oldToken = answer.token;
      return answer;
    });
    vi.spyOn(f.manager.upstream, "respond").mockImplementation(() => {
      f.pool.registry.unlock(request.key, oldToken);
      newToken = claim(request.key, context, { kind: "approval", choice: "deny" }).token;
      throw new GatewayError("GATEWAY_OFFLINE", "Fake vor Send.", "not_sent");
    });
    await f.manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "not_sent" });
    expect(newToken).not.toBe(oldToken);
    expect(() => claim(request.key, context, { kind: "approval", choice: "once" })).toThrow(/bereits/);
    f.pool.registry.unlock(request.key, newToken);
    expect(() => claim(request.key, context, { kind: "approval", choice: "once" })).not.toThrow();
    expect(f.gateway.responses).toHaveLength(0);
  });

  it.each(["after-send", "callback"] as const)("Submit nach %s bleibt unknown und wird nicht wiederholt", async (kind) => {
    const session = await subscribe();
    failSend("prompt.submit", kind === "after-send", kind === "callback");
    await f.manager.handle("tab", message({ op: "message.submit", sessionId: session.id, text: "Möglicherweise angenommen" }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "unknown" });
    await expect.poll(() => f.gateway.calls.filter((entry) => entry.method === "prompt.submit").length).toBe(1);
    expect(session.running).toBe(true);
  });

  it("behält nach Response-Send und anschließendem Throw den Claim bis zum autoritativen Settlement", async () => {
    const { session, request } = await openRequest();
    const unlock = vi.spyOn(f.pool.registry, "unlock");
    failSend("srq-test", true);
    await f.manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "unknown" });
    expect(unlock).not.toHaveBeenCalled();
    await expect.poll(() => f.gateway.responses.length).toBe(1);
  });

  it("meldet einen Response-Write-Callbackfehler nach Annahme unknown und löst keinen Claim selbst", async () => {
    const { session, request } = await openRequest();
    const unlock = vi.spyOn(f.pool.registry, "unlock");
    failSend("srq-test", false, true);
    await f.manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "unknown" });
    expect(unlock).not.toHaveBeenCalled();
    await expect.poll(() => f.gateway.responses.length).toBe(1);
  });
});
