import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientMessage as message, securityFixture, type SecurityFixture } from "./security-test.fixture.js";
import { object } from "./normalize-values.js";
import { tmpdir } from "node:os";

describe("Protokollfehler nach Send und ungeklärte Anbindung", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { await f.close(); vi.restoreAllMocks(); });

  async function subscribe(running = false) {
    const session = f.gateway.seed("post-send");
    session.running = running;
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    return session;
  }

  it.each([
    { op: "message.submit", fields: { text: "Test" }, method: "prompt.submit", invalid: { status: "unexpected" } },
    { op: "session.stop", fields: {}, method: "session.interrupt", invalid: { status: "unexpected" } },
    { op: "session.steer", fields: { text: "Test" }, method: "session.steer", invalid: { status: "unexpected" } },
    { op: "model.select", fields: { selection: { provider: "test", model: "model-b" } }, method: "config.set", invalid: { deferred: "unexpected" } },
    { op: "request.lock", fields: { questionId: "q1", answer: "A" }, method: "clarify.lock", invalid: { status: "unexpected" } },
  ])("meldet nach ausgeführtem $method und ungültigem Resultat unknown", async ({ op, fields, method, invalid }) => {
    const session = await subscribe();
    let requestFields = {};
    if (op === "request.lock") {
      f.gateway.request(session, "clarify", { questions: [{ qid: "q1", question: "Welche?" }] });
      await expect.poll(() => f.manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
      const request = f.manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
      requestFields = { requestKey: request.key, epoch: request.epoch };
    }
    f.gateway.resultHook = (name, _params, value) => name === method ? invalid : value;
    await f.manager.handle("tab", message({ op, sessionId: session.id, ...fields, ...requestFields }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH", outcome: "unknown" });
    expect(f.gateway.calls.filter((entry) => entry.method === method)).toHaveLength(1);
    if (op === "message.submit") {
      expect(session.running).toBe(true);
      f.manager.release("tab", "v2-disabled");
      expect(f.manager.retainRuntime).toBe(true);
      expect(session.running).toBe(true);
      f.gateway.event(session, "message.complete", { text: "Fertig" });
      await expect.poll(() => f.gateway.server.clients.size).toBe(0);
    }
  });

  it("klassifiziert auch ein fehlendes Result-Feld nach angenommenem Submit als unknown", async () => {
    const session = await subscribe();
    f.gateway.resultHook = (method, _params, value) => method === "prompt.submit" ? undefined : value;
    await f.manager.handle("tab", message({ op: "message.submit", sessionId: session.id, text: "Test" }));
    expect(session.running).toBe(true);
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH", outcome: "unknown" });
    expect(f.gateway.calls.filter((entry) => entry.method === "prompt.submit")).toHaveLength(1);
  });

  it.each(["schema", "cwd", "snapshot"] as const)("Create meldet bei nachgelagertem %s-Fehler unknown", async (kind) => {
    f.gateway.resultHook = (method, _params, value) => {
      const raw = object(value);
      if (method === "session.create" && kind === "schema") return { ...raw, info: { ...object(raw.info), desktop_contract: 9 } };
      if (method === "session.create" && kind === "cwd") return { ...raw, info: { ...object(raw.info), cwd: tmpdir() } };
      if (method === "session.events.since" && kind === "snapshot") return { ...raw, count: "invalid" };
      return value;
    };
    await f.manager.handle("tab", message({ op: "session.create", projectId: null }));
    expect(f.gateway.sessions.size).toBe(1);
    expect(f.gateway.calls.filter((entry) => entry.method === "session.create")).toHaveLength(1);
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "unknown" });
  });

  it("meldet einen Fehler beim Request-Abgleich nach Response-Send ebenfalls unknown", async () => {
    const session = await subscribe();
    f.gateway.request(session, "approval", { choices: ["once", "deny"] });
    await expect.poll(() => f.manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = f.manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    let responseSent = false;
    f.gateway.responseHook = () => { responseSent = true; };
    f.gateway.resultHook = (method, _params, value) => responseSent && method === "session.events.since" ? { invalid: true } : value;
    await f.manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } }));
    expect(f.gateway.responses).toHaveLength(1);
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH", outcome: "unknown" });
  });

  it("belässt einen ungültigen Preflight vor Submit bei not_sent", async () => {
    const session = await subscribe(true);
    f.gateway.contract = 9;
    await f.manager.handle("tab", message({ op: "message.submit", sessionId: session.id, text: "Nie senden" }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH", outcome: "not_sent" });
    expect(f.gateway.calls.some((entry) => entry.method === "prompt.submit")).toBe(false);
    f.manager.release("tab", "v2-disabled");
    expect(session.running).toBe(true);
  });

  it.each(["contract", "cwd-missing", "info-missing", "count", "live-id-missing", "null"] as const)("hält fremde Runtime nach inkompatiblem Resume (%s) bis Settlement", async (kind) => {
    const session = f.gateway.seed("foreign-invalid");
    session.running = true;
    session.closeOnDisconnect = true;
    f.gateway.resultHook = (method, _params, value) => {
      if (method !== "session.resume") return value;
      const raw = object(value);
      if (kind === "contract") return { ...raw, info: { ...object(raw.info), desktop_contract: 9 } };
      if (kind === "cwd-missing") return { ...raw, info: { desktop_contract: 8 } };
      if (kind === "info-missing") return { ...raw, info: null };
      if (kind === "count") return { ...raw, message_count: -1 };
      if (kind === "live-id-missing") return { ...raw, session_id: null };
      return null;
    };
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH", outcome: "unknown" });
    expect(f.manager.sessions.records.size).toBe(0);
    expect(f.manager.retainRuntime).toBe(true);
    f.manager.release("tab", "v2-disabled");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.gateway.server.clients.size).toBe(1);
    expect(session.running).toBe(true);
    expect(session.closeOnDisconnect).toBe(true);
    f.gateway.event(session, "message.complete", { text: "Wirklich fertig" });
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
    expect(f.gateway.calls.some((entry) => ["session.close", "session.interrupt"].includes(entry.method))).toBe(false);
  });

  it("hält nach Hauptabschluss noch Requests oder echte Hintergrundarbeit geschützt", async () => {
    const session = f.gateway.seed("foreign-background");
    session.running = true;
    f.gateway.contract = 9;
    f.gateway.subagents = [{ id: "child", status: "running" }];
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    f.manager.release("tab", "v2-disabled");
    f.gateway.event(session, "message.complete", { text: "Hauptturn fertig" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.gateway.server.clients.size).toBe(1);
    f.gateway.subagents = [];
    f.gateway.request(session, "approval", { choices: ["once", "deny"] });
    f.gateway.event(session, "subagent.complete", { id: "child", status: "completed" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.gateway.server.clients.size).toBe(1);
    session.requests = [];
    f.gateway.event(session, "request.cancel", { id: "srq-test" });
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
  });

  it("erhält eine fremde Runtime nach gültigem Resume mit verbotenem Antwort-CWD lesbar", async () => {
    const session = f.gateway.seed("foreign-cwd");
    session.running = true;
    f.gateway.resultHook = (method, _params, value) => method === "session.resume" ? { ...object(value), info: { ...object(object(value).info), cwd: tmpdir() } } : value;
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "session.subscribe", data: { snapshot: { writable: false } } });
    f.manager.release("tab", "v2-disabled");
    expect(f.manager.retainRuntime).toBe(true);
    expect(session.running).toBe(true);
    f.gateway.event(session, "message.complete", { text: "Fertig" });
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
  });

  it("rät bei widersprüchlicher Live-ID kein Settlement und respektiert explizites App-Cleanup", async () => {
    const session = f.gateway.seed("foreign-ambiguous");
    session.running = true;
    f.gateway.resultHook = (method, _params, value) => method === "session.resume" ? { ...object(value), session_id: "wrong-live", info: null } : value;
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    f.manager.release("tab", "v2-disabled");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const calls = f.gateway.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(f.gateway.calls.length).toBe(calls);
    expect(f.gateway.server.clients.size).toBe(1);
    expect(session.running).toBe(true);
    f.pool.dispose();
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
  });

  it("begrenzt Schutzreservierungen ohne brauchbare IDs und verändert keine weitere Session", async () => {
    await f.close();
    f = await securityFixture({ maxSessions: 1 });
    f.gateway.resultHook = (method, _params, value) => method === "session.create" ? null : value;
    await f.manager.handle("tab", message({ op: "session.create", projectId: null }));
    f.manager.release("tab", "v2-disabled");
    expect(f.manager.retainRuntime).toBe(true);
    expect(() => f.manager.sessions.protection.reserve(null)).toThrow(/ungeklärte/);
    expect(f.gateway.calls.filter((entry) => entry.method === "session.create")).toHaveLength(1);
  });
});
