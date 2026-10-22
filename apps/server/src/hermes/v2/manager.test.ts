import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hermesV2ClientMessageSchema, type HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { FakeGateway } from "./fake-gateway.fixture.js";
import { GatewayPool } from "./pool.js";
import type { GatewayManager } from "./manager.js";

const message = (value: object) => hermesV2ClientMessageSchema.parse({ v: 1, id: randomUUID(), ...value });
function result(messages: HermesV2ServerMessage[], op: "session.create" | "session.subscribe") {
  const entry = messages.findLast((entry) => entry.type === "result" && entry.op === op);
  if (entry?.type !== "result" || (entry.op !== "session.create" && entry.op !== "session.subscribe")) throw new Error(JSON.stringify(messages));
  return entry.data.snapshot;
}

describe("GatewayManager mit echtem Fake-WebSocket", () => {
  let root: string;
  let gateway: FakeGateway;
  let pool: GatewayPool;
  let manager: GatewayManager;
  let messages: HermesV2ServerMessage[];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hermes-v2-manager-"));
    gateway = new FakeGateway(root);
    pool = new GatewayPool(gateway.dependencies(await gateway.start()));
    manager = pool.get("ben");
    messages = [];
    manager.add({ id: "tab-a", send: (entry) => messages.push(entry) });
  });
  afterEach(async () => { pool.dispose(); await gateway.close(); await rm(root, { recursive: true, force: true }); });

  async function create() {
    await manager.handle("tab-a", message({ op: "session.create", projectId: null }));
    return result(messages, "session.create");
  }

  it("erstellt einen flüchtigen Draft und hält den Token intern", async () => {
    const snapshot = await create();
    expect(snapshot.session.draft).toBe(true);
    expect(snapshot.writable).toBe(true);
    expect(snapshot.session.cwd).toBe(root);
    expect(gateway.calls.find((entry) => entry.method === "session.create")?.params.close_on_disconnect).toBe(false);
    expect(gateway.calls[0]).toEqual({ method: "client.capabilities", params: { server_requests: true } });
    expect(JSON.stringify(messages)).not.toContain(gateway.token);
  });

  it("verwendet für zwei Tabs denselben Manager und Upstream; Stop arbeitet fachlich", async () => {
    const snapshot = await create();
    expect(pool.get("ben")).toBe(manager);
    const second: HermesV2ServerMessage[] = [];
    manager.add({ id: "tab-b", send: (entry) => second.push(entry) });
    await manager.handle("tab-b", message({ op: "session.subscribe", sessionId: snapshot.session.id }));
    expect(result(second, "session.subscribe").session.id).toBe(snapshot.session.id);
    expect(gateway.connections).toBe(1);
    await manager.handle("tab-a", message({ op: "message.submit", sessionId: snapshot.session.id, text: "Hallo" }));
    await manager.handle("tab-b", message({ op: "session.stop", sessionId: snapshot.session.id }));
    expect(gateway.calls.at(-1)?.method).toBe("session.interrupt");
    expect(gateway.calls.some((entry) => ["shell.exec", "command.dispatch", "slash.exec", "session.close"].includes(entry.method))).toBe(false);
  });

  it("normalisiert Streaming/Tools/Reasoning und dedupliziert echte Sequenzen", async () => {
    const snapshot = await create();
    const session = gateway.sessions.get(snapshot.session.id)!;
    gateway.event(session, "message.start");
    gateway.event(session, "message.delta", { text: "Antwort" });
    gateway.event(session, "reasoning.delta", { text: "Sichtbarer Modellinhalt" });
    gateway.event(session, "tool.start", { tool_id: "tool-1", name: "terminal", args: { token: "dummy-secret" } });
    gateway.event(session, "tool.complete", { tool_id: "tool-1", name: "terminal", result: "API_KEY=dummy-secret", duration_s: 0.5 });
    gateway.event(session, "message.complete", { text: "Fertig", persisted_turn: { row_ids: [10, 11], user_row_id: 10, final_assistant_row_id: 11, complete: true } });
    const duplicate = { jsonrpc: "2.0", method: "event", params: session.events.at(-1) };
    for (const socket of gateway.server.clients) socket.send(JSON.stringify(duplicate));
    await expect.poll(() => messages.filter((entry) => entry.type === "event").length).toBe(6);
    const completed = messages.findLast((entry) => entry.type === "event" && entry.event.type === "message.completed");
    expect(completed?.type === "event" && completed.event.type === "message.completed" && completed.event.payload.persistedTurn?.assistantRowId).toBe(11);
    expect(JSON.stringify(messages)).not.toContain("dummy-secret");
    expect(JSON.stringify(messages)).not.toContain("rendered");
  });

  it("stellt nach neuem Epoch Live-ID, History und Snapshot ohne wiederholten Submit wieder her", async () => {
    const snapshot = await create();
    await manager.handle("tab-a", message({ op: "message.submit", sessionId: snapshot.session.id, text: "Nur einmal" }));
    const session = gateway.sessions.get(snapshot.session.id)!;
    session.messages.push({ row_id: 2, role: "assistant", text: "Bereits fertig" });
    session.inflight = null;
    session.running = false;
    gateway.disconnect("epoch-2");
    await expect.poll(() => messages.some((entry) => entry.type === "snapshot" && entry.snapshot.epoch === "epoch-2"), { timeout: 5_000 }).toBe(true);
    expect(gateway.calls.filter((entry) => entry.method === "prompt.submit")).toHaveLength(1);
    const restored = messages.findLast((entry) => entry.type === "snapshot");
    expect(restored?.type === "snapshot" && restored.snapshot.messages.map((entry) => entry.text)).toEqual(["Nur einmal", "Bereits fertig"]);
    expect(gateway.calls.findLast((entry) => entry.method === "session.resume")?.params).toMatchObject({ close_on_disconnect: false, lazy: true, omit_messages: true });
  });

  it("verliert Completion zwischen History-Lesen und Snapshot nicht", async () => {
    const session = gateway.seed("stored-race");
    session.running = true;
    session.inflight = { user: "Frage", assistant: "Halb", streaming: true };
    session.messages.push({ row_id: 1, role: "user", text: "Frage" });
    gateway.historyHook = () => {
      session.messages.push({ row_id: 2, role: "assistant", text: "Vollständig" });
      session.running = false;
      session.inflight = null;
      gateway.event(session, "message.complete", { text: "Vollständig" });
    };
    await manager.handle("tab-a", message({ op: "session.subscribe", sessionId: session.id }));
    const snapshot = result(messages, "session.subscribe");
    expect(snapshot.messages.map((entry) => entry.text)).toEqual(["Frage", "Vollständig"]);
    expect(snapshot.cursor).toBe(1);
    expect(snapshot.inflight).toBeNull();
  });

  it("prüft CWD erneut vor Approval und lässt unbekannte CWD ausschließlich lesend", async () => {
    const session = gateway.seed("stored-cwd");
    await manager.handle("tab-a", message({ op: "session.subscribe", sessionId: session.id }));
    gateway.request(session, "approval", { choices: ["once", "deny"], command: "Test" });
    await expect.poll(() => manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    session.cwd = tmpdir();
    await manager.handle("tab-a", message({ op: "request.respond", sessionId: session.id, epoch: request.epoch, requestKey: request.key, response: { kind: "approval", choice: "once" } }));
    expect(gateway.responses).toHaveLength(0);
    expect(messages.at(-1)).toMatchObject({ type: "error", code: "PROJECT_FORBIDDEN" });
    const outside = gateway.seed("outside");
    outside.cwd = tmpdir();
    const resumesBefore = gateway.calls.filter((entry) => entry.method === "session.resume").length;
    await manager.handle("tab-a", message({ op: "session.subscribe", sessionId: outside.id }));
    expect(result(messages, "session.subscribe").writable).toBe(false);
    expect(gateway.calls.filter((entry) => entry.method === "session.resume")).toHaveLength(resumesBefore);
  });

  it("projiziert Kataloge, sperrt unbekannte Modellpaare und erzwingt --session", async () => {
    const snapshot = await create();
    await manager.handle("tab-a", message({ op: "catalog.read", sessionId: snapshot.session.id }));
    expect(JSON.stringify(messages)).not.toContain("secret.invalid");
    expect(JSON.stringify(messages)).not.toContain("key_env");
    expect(JSON.stringify(messages)).not.toContain("hidden-value");
    await manager.handle("tab-a", message({ op: "model.select", sessionId: snapshot.session.id, selection: { provider: "test", model: "unknown" } }));
    expect(gateway.calls.some((entry) => entry.method === "config.set")).toBe(false);
    await manager.handle("tab-a", message({ op: "model.select", sessionId: snapshot.session.id, selection: { provider: "test", model: "model-b" } }));
    expect(gateway.calls.at(-1)).toEqual({ method: "config.set", params: { session_id: gateway.sessions.get(snapshot.session.id)!.liveId, key: "model", value: "model-b --provider test --session" } });
  });

  it("verhindert Secret-Echo und konkurrierende Antworten", async () => {
    const snapshot = await create();
    const session = gateway.sessions.get(snapshot.session.id)!;
    manager.add({ id: "tab-b", send: (entry) => messages.push(entry) });
    await manager.handle("tab-b", message({ op: "session.subscribe", sessionId: session.id }));
    gateway.request(session, "secret", { env_var: "DUMMY", prompt: "Eingabe" });
    await expect.poll(() => manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    await Promise.all(["tab-a", "tab-b"].map((connection) => manager.handle(connection, message({ op: "request.respond", sessionId: session.id, epoch: request.epoch, requestKey: request.key, response: { kind: "secret", value: "dummy-ephemeral-value" } }))));
    expect(gateway.responses.filter((entry) => entry.id === "srq-test")).toHaveLength(1);
    gateway.event(session, "message.delta", { text: "Echo dummy-ephemeral-value" });
    await expect.poll(() => JSON.stringify(messages).includes("Echo ***")).toBe(true);
    expect(JSON.stringify(messages)).not.toContain("dummy-ephemeral-value");
  });

  it("wiederholt Submit bei verlorener Antwort nicht und meldet unbekannten Ausgang", async () => {
    const snapshot = await create();
    gateway.dropSubmit = true;
    await manager.handle("tab-a", message({ op: "message.submit", sessionId: snapshot.session.id, text: "Einmal" }));
    expect(messages.some((entry) => entry.type === "error" && entry.outcome === "unknown")).toBe(true);
    await expect.poll(() => gateway.connections > 1).toBe(true);
    expect(gateway.calls.filter((entry) => entry.method === "prompt.submit")).toHaveLength(1);
  });

  it("weist abweichenden Contract zurück und entfernt fehlgeschlagene neue Abos", async () => {
    const session = gateway.seed("stored-version");
    gateway.contract = 9;
    await manager.handle("tab-a", message({ op: "session.subscribe", sessionId: session.id }));
    expect(messages.at(-1)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH" });
    expect(manager.sessions.records.get(session.id)?.subscribers.has("tab-a")).not.toBe(true);
  });

  it("hält bei explizitem Flag-off nur fremde laufende Runtime und stoppt sie nicht", async () => {
    const session = gateway.seed("stored-existing");
    session.running = true;
    await manager.handle("tab-a", message({ op: "session.subscribe", sessionId: session.id }));
    manager.release("tab-a", "v2-disabled");
    expect(manager.retainRuntime).toBe(true);
    expect(gateway.calls.some((entry) => ["session.close", "session.interrupt"].includes(entry.method))).toBe(false);
    gateway.event(session, "message.complete", { text: "Fertig" });
    await expect.poll(() => gateway.server.clients.size).toBe(0);
  });
});
