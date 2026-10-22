import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientMessage as message, securityFixture, type SecurityFixture } from "./security-test.fixture.js";
import { eventSchema } from "./upstream-schemas.js";

const globalEvents = ["sessions.changed", "skin.changed", "pet.changed", "cron.changed", "platforms.changed", "projects.changed",
  "pairing.changed", "bot_relay.outbox.pending", "session.reclaimed", "approval.cancelled", "display.status", "display.lease",
  "display.install.log", "display.install.done", "connection.update"];

describe("Globale Core-Ereignisse und geschützter Protokollfehler", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { await f.close(); });

  function send(raw: string) {
    for (const socket of f.gateway.server.clients) socket.send(raw);
  }

  async function foreignRunning() {
    const session = f.gateway.seed("foreign-malformed-event");
    session.running = true;
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    expect(session.closeOnDisconnect).toBe(true);
    return session;
  }

  it.each(globalEvents)("akzeptiert das belegte globale %s mit leerer Session-ID", async (type) => {
    const session = await foreignRunning();
    const before = f.messages.length;
    send(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type, session_id: "", payload: { ignored: true } } }));
    f.gateway.event(session, "message.complete", { text: "Unverlorener Abschluss" });
    await expect.poll(() => f.messages.some((entry) => entry.type === "event" && entry.event.type === "message.completed")).toBe(true);
    expect(f.manager.upstream.state).toBe("online");
    expect(f.messages.slice(before).some((entry) => entry.type === "error")).toBe(false);
    if (type === "sessions.changed") expect(f.messages.slice(before).some((entry) => entry.type === "event" && entry.event.type === "sessions.invalidated")).toBe(true);
  });

  it.each(["message.delta", "message.complete", "tool.start", "subagent.complete", "error"])("verlangt für %s eine echte Session-ID", (type) => {
    expect(eventSchema.safeParse({ type, session_id: "" }).success).toBe(false);
    expect(eventSchema.safeParse({ type, session_id: "live-valid" }).success).toBe(true);
  });

  it.each(["json", "envelope", "normalizer"] as const)("schützt fremde Arbeit nach %s-Fehler und entsorgt erst nach Settlement", async (kind) => {
    const session = await foreignRunning();
    f.gateway.request(session, "approval", { choices: ["once", "deny"] });
    await expect.poll(() => f.manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    if (kind === "json") send("{invalid-json");
    if (kind === "envelope") send(JSON.stringify({ jsonrpc: "2.0", method: "event", params: { type: "message.delta", session_id: "", payload: { text: "Invalid" } } }));
    if (kind === "normalizer") f.gateway.event(session, "tool.start", { name: "terminal" });
    await expect.poll(() => f.manager.upstream.state).toBe("incompatible");
    expect(f.manager.upstream.quarantined).toBe(true);
    expect(f.manager.retainRuntime).toBe(true);
    expect(f.manager.sessions.records.get(session.id)?.snapshot.writable).toBe(false);
    expect(session.running).toBe(true);
    const calls = f.gateway.calls.length;
    await f.manager.handle("tab", message({ op: "message.submit", sessionId: session.id, text: "Darf nicht starten" }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH", outcome: "not_sent" });
    expect(f.gateway.calls.slice(calls).some((entry) => entry.method === "prompt.submit")).toBe(false);
    f.manager.release("tab", "v2-disabled");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.gateway.server.clients.size).toBe(1);
    expect(session.running).toBe(true);
    f.gateway.event(session, "message.complete", { text: "Jetzt fertig" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.gateway.server.clients.size).toBe(1);
    session.requests = [];
    f.gateway.event(session, "request.cancel", { id: "srq-test" });
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
    expect(f.gateway.calls.some((entry) => ["session.close", "session.interrupt"].includes(entry.method))).toBe(false);
  });

  it("erlaubt in Quarantäne nur begrenzte Lifecycle-Lesungen und unbekannte Request-Ablehnung", async () => {
    await foreignRunning();
    send("{invalid-json");
    await expect.poll(() => f.manager.upstream.state).toBe("incompatible");
    const calls = f.gateway.calls.length;
    await expect(f.manager.upstream.call("config.set", { key: "model", value: "unzulässig" }, true)).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH", outcome: "not_sent" });
    await expect(f.manager.upstream.call("session.resume", { session_id: "anything" })).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    expect(() => f.manager.upstream.respond("srq-forbidden", { choice: "once" })).toThrow();
    expect(f.gateway.calls.slice(calls).some((entry) => entry.method === "config.set" || entry.method === "session.resume")).toBe(false);
    await expect(f.manager.upstream.call("gateway.ping", {})).resolves.toEqual({ ok: true });
    send(JSON.stringify({ jsonrpc: "2.0", id: "srq-unknown", method: "preview.act", params: {} }));
    await expect.poll(() => f.gateway.responses.some((entry) => entry.id === "srq-unknown")).toBe(true);
    expect(f.gateway.responses.find((entry) => entry.id === "srq-unknown")).toMatchObject({ error: { code: -32601 } });
  });

  it("beendet eine fehlerhafte Verbindung ohne möglicherweise laufende Runtime", async () => {
    await f.manager.handle("tab", message({ op: "sessions.list" }));
    send("{invalid-json");
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
    expect(f.manager.upstream.state).toBe("incompatible");
    expect(f.manager.retainRuntime).toBe(false);
  });

  it("klassifiziert ein angenommenes Submit bei gleichzeitig fehlerhaftem Frame als unknown", async () => {
    const session = await foreignRunning();
    f.gateway.resultHook = (method, _params, value) => {
      if (method === "prompt.submit") send("{invalid-json");
      return value;
    };
    await f.manager.handle("tab", message({ op: "message.submit", sessionId: session.id, text: "Angenommen" }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "unknown" });
    expect(f.gateway.calls.filter((entry) => entry.method === "prompt.submit")).toHaveLength(1);
    f.manager.release("tab", "v2-disabled");
    expect(session.running).toBe(true);
    f.gateway.event(session, "message.complete", { text: "Abgeschlossen" });
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
  });

  it("schützt den noch ungemappten Resume während eines Protokollfehlers", async () => {
    const session = f.gateway.seed("unmapped-malformed");
    session.running = true;
    f.gateway.beforeResumeReply = () => send("{invalid-json");
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    expect(f.messages.at(-1)).toMatchObject({ type: "error", outcome: "unknown" });
    expect(f.manager.sessions.records.size).toBe(0);
    f.manager.release("tab", "v2-disabled");
    expect(f.manager.retainRuntime).toBe(true);
    expect(session.running).toBe(true);
    f.gateway.event(session, "message.complete", { text: "Abgeschlossen" });
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
  });

  it("schützt fremde Arbeit bei inkompatibler Heartbeat-Antwort", async () => {
    await f.close();
    f = await securityFixture({ heartbeatMs: 20, heartbeatTimeoutMs: 100 });
    const session = await foreignRunning();
    f.gateway.resultHook = (method, _params, value) => method === "gateway.ping" ? { ok: "invalid" } : value;
    await expect.poll(() => f.manager.upstream.quarantined).toBe(true);
    f.manager.release("tab", "v2-disabled");
    expect(session.running).toBe(true);
    expect(f.gateway.server.clients.size).toBe(1);
    f.gateway.resultHook = null;
    f.gateway.event(session, "message.complete", { text: "Fertig" });
    await expect.poll(() => f.gateway.server.clients.size).toBe(0);
  });
});
