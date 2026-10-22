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

describe("Gateway Recovery und Ressourcengrenzen", () => {
  let root: string;
  let gateway: FakeGateway;
  let pool: GatewayPool;
  let manager: GatewayManager;
  let messages: HermesV2ServerMessage[];
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "hermes-v2-recovery-"));
    gateway = new FakeGateway(root);
    pool = new GatewayPool(gateway.dependencies(await gateway.start()));
    manager = pool.get("ben");
    messages = [];
    manager.add({ id: "tab", send: (entry) => messages.push(entry) });
  });
  afterEach(async () => { pool.dispose(); await gateway.close(); await rm(root, { recursive: true, force: true }); });

  it("antwortet unbekannten Desktop-Requests ohne Session sofort mit -32601", async () => {
    await manager.handle("tab", message({ op: "sessions.list" }));
    for (const socket of gateway.server.clients) socket.send(JSON.stringify({ jsonrpc: "2.0", id: "srq-unsupported", method: "preview.act", params: {} }));
    await expect.poll(() => gateway.responses.length).toBe(1);
    expect(gateway.responses[0]).toMatchObject({ id: "srq-unsupported", error: { code: -32601 } });
  });

  it("rettet bekannte Requests vor Resume-Mapping über offene Requests im Snapshot", async () => {
    const session = gateway.seed("early-request");
    gateway.beforeResumeReply = () => gateway.request(session, "approval", { choices: ["once", "deny"], command: "Test" }, "srq-early");
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    const response = messages.findLast((entry) => entry.type === "result" && entry.op === "session.subscribe");
    expect(response?.type === "result" && response.op === "session.subscribe" && response.data.snapshot.requests[0]?.kind).toBe("approval");
    expect(gateway.responses.some((entry) => entry.id === "srq-early")).toBe(false);
  });

  it("weist eine bereits klassisch beantwortete Anfrage vor lokalem Claim zurück", async () => {
    const session = gateway.seed("classic-wins");
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    gateway.request(session, "approval", { choices: ["once", "deny"] });
    await expect.poll(() => manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    session.requests = [];
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } }));
    expect(gateway.responses).toHaveLength(0);
    expect(messages.at(-1)).toMatchObject({ type: "error", code: "STALE_REQUEST" });
  });

  it("sperrt weitere Operationen nach fehlerhaftem Upstream-Frame", async () => {
    await manager.handle("tab", message({ op: "sessions.list" }));
    for (const socket of gateway.server.clients) socket.send('{"jsonrpc":"2.0","method":"event","params":{"type":12}}');
    await expect.poll(() => messages.some((entry) => entry.type === "connection" && entry.state === "incompatible")).toBe(true);
    const calls = gateway.calls.length;
    await manager.handle("tab", message({ op: "session.create", projectId: null }));
    expect(messages.at(-1)).toMatchObject({ type: "error", code: "PROTOCOL_MISMATCH" });
    expect(gateway.calls).toHaveLength(calls);
  });

  it("rekonstruiert abgeschnittenes Replay mit aktiven Tools und offener Frage aus Snapshots", async () => {
    const session = gateway.seed("truncated");
    session.running = true;
    session.inflight = { user: "Frage", assistant: "Bisher", streaming: true };
    session.messages.push({ id: 8, role: "user", content: "Frage" });
    gateway.event(session, "tool.start", { tool_id: "tool-running", name: "terminal", args: { command: "pwd" } });
    gateway.request(session, "clarify", { questions: [{ qid: "q1", question: "Welche?" }] });
    gateway.truncated = true;
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id, cursor: { epoch: gateway.epoch, seq: 999 } }));
    const response = messages.findLast((entry) => entry.type === "result" && entry.op === "session.subscribe");
    if (response?.type !== "result" || response.op !== "session.subscribe") throw new Error("Snapshot fehlt");
    expect(response.data.snapshot.inflight?.assistant).toBe("Bisher");
    expect(response.data.snapshot.messages.some((entry) => entry.toolId === "tool-running" && entry.toolStatus === "running")).toBe(true);
    expect(response.data.snapshot.requests[0]?.kind).toBe("clarify");
    expect(response.data.snapshot.cursor).toBe(1);
  });

  it("liefert echte begrenzte Historyseiten ohne vollständige History-RPCs", async () => {
    const session = gateway.seed("long-history");
    session.messages = Array.from({ length: 450 }, (_, index) => ({ id: index + 1, role: index % 2 ? "assistant" : "user", content: `Nachricht ${index + 1}` }));
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    const snapshot = messages.findLast((entry) => entry.type === "result" && entry.op === "session.subscribe");
    expect(snapshot?.type === "result" && snapshot.op === "session.subscribe" && snapshot.data.snapshot.messages.length).toBe(200);
    await manager.handle("tab", message({ op: "history.read", sessionId: session.id, limit: 100, offset: 200 }));
    const page = messages.at(-1);
    expect(page?.type === "result" && page.op === "history.read" && page.data.messages[0]?.rowId).toBe(151);
    expect(gateway.calls.some((call) => call.method === "session.history")).toBe(false);
  });

  it("erzwingt bewusste Modellbestätigung ohne automatisch erneut zu wechseln", async () => {
    const session = gateway.seed("model-confirm");
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    gateway.modelConfirmation = true;
    await manager.handle("tab", message({ op: "model.select", sessionId: session.id, selection: { provider: "test", model: "model-b" } }));
    expect(gateway.calls.filter((call) => call.method === "config.set")).toHaveLength(1);
    expect(messages.at(-1)).toMatchObject({ type: "result", op: "model.select", data: { confirmation: "Modellwechsel bestätigen" } });
    await manager.handle("tab", message({ op: "model.select", sessionId: session.id, selection: { provider: "test", model: "model-b" }, confirmed: true }));
    expect(gateway.calls.at(-1)?.params.confirm_expensive_model).toBe(true);
    expect(messages.at(-1)).toMatchObject({ type: "result", data: { confirmation: null } });
  });

  it("überträgt nie ein Modell als CLI-Flag", async () => {
    const session = gateway.seed("model-flags");
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    await manager.handle("tab", message({ op: "model.select", sessionId: session.id, selection: { provider: "test", model: "--global" } }));
    expect(messages.at(-1)).toMatchObject({ type: "error", code: "INVALID_MESSAGE" });
    expect(gateway.calls.some((call) => call.method === "config.set")).toBe(false);
  });

  it("hält 20 tatsächliche Working-Sessions ohne zwanzig Transportverbindungen", async () => {
    for (let index = 0; index < 20; index++) {
      const session = gateway.seed(`working-${index}`);
      session.running = true;
      await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    }
    expect(manager.sessions.records.size).toBe(20);
    expect([...manager.sessions.records.values()].every((record) => record.snapshot.running)).toBe(true);
    expect(gateway.connections).toBe(1);
  });

  it("wählt für einen anderen Principal eigenen Manager ohne Mandantenisolationsbehauptung", async () => {
    const other = pool.get("admin");
    expect(other).not.toBe(manager);
    other.add({ id: "admin-tab", send: () => undefined });
    await Promise.all([manager.handle("tab", message({ op: "sessions.list" })), other.handle("admin-tab", message({ op: "sessions.list" }))]);
    expect(gateway.connections).toBe(2);
  });

  it("dispose beendet Timer/Upstream und plant keine neue Verbindung", async () => {
    await manager.handle("tab", message({ op: "sessions.list" }));
    pool.dispose();
    gateway.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(gateway.connections).toBe(1);
    expect(gateway.server.clients.size).toBe(0);
  });

  it("schützt einen laufenden fremden Turn auch bei Flag-off mitten im Resume", async () => {
    const session = gateway.seed("disconnect-during-resume");
    session.running = true;
    gateway.beforeResumeReply = () => manager.release("tab", "v2-disabled");
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    expect(manager.retainRuntime).toBe(true);
    expect(manager.sessions.records.get(session.id)?.subscribers.size).toBe(0);
    expect(gateway.server.clients.size).toBe(1);
    expect(gateway.calls.some((entry) => ["session.close", "session.interrupt"].includes(entry.method))).toBe(false);
    gateway.event(session, "message.complete", { text: "Weitergelaufen" });
    await expect.poll(() => gateway.server.clients.size).toBe(0);
  });

  it("sperrt CWD-Wechsel im Resume-Ergebnis ohne fremde laufende Arbeit zu schließen", async () => {
    const session = gateway.seed("cwd-after-resume");
    session.running = true;
    gateway.beforeResumeReply = () => { session.cwd = tmpdir(); };
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    const response = messages.findLast((entry) => entry.type === "result" && entry.op === "session.subscribe");
    expect(response?.type === "result" && response.op === "session.subscribe" && response.data.snapshot.writable).toBe(false);
    manager.release("tab", "v2-disabled");
    expect(manager.retainRuntime).toBe(true);
    expect(gateway.server.clients.size).toBe(1);
    expect(gateway.calls.some((entry) => entry.method === "prompt.submit")).toBe(false);
  });

  it("entsorgt fremde Runtime erst nach tatsächlichem Subagent-Abschluss", async () => {
    const session = gateway.seed("background-child");
    gateway.subagents = [{ subagent_id: "child-a", status: "running" }];
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    manager.release("tab", "v2-disabled");
    expect(manager.retainRuntime).toBe(true);
    gateway.subagents = [];
    gateway.event(session, "subagent.complete", { subagent_id: "child-a", goal: "Test", task_count: 1, task_index: 0, status: "completed" });
    await expect.poll(() => gateway.server.clients.size).toBe(0);
  });
});
