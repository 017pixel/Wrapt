import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { once } from "node:events";
import { WebSocket } from "ws";
import type { HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { hermesV2Policy } from "./policy.js";
import { SecretRedactor } from "./secret-redactor.js";
import { clientMessage as message, securityFixture, type SecurityFixture } from "./security-test.fixture.js";

describe("Security: gemeinsame Secretkenntnis und Runtime-Eigentum", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { await f.close(); });

  it("redigiert Secretantworten zwischen Principals in Tools, geteilten Streams, History und Snapshots", async () => {
    const { gateway, manager, pool, messages } = f;
    const session = gateway.seed("shared-secret");
    const other = pool.get("admin");
    const otherMessages: HermesV2ServerMessage[] = [];
    // Gleiche Browser-ID und Turn-ID dürfen keine gemeinsamen Stream-Puffer erzeugen.
    other.add({ id: "tab", send: (value) => otherMessages.push(value) });
    for (const entry of [manager, other]) await entry.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    gateway.request(session, "secret", { env_var: "DEMO", prompt: "Eingabe" });
    await expect.poll(() => other.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    const secret = "DEMO_VALUE_90372";
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "secret", value: secret } }));
    for (const entry of [manager, other]) entry.sessions.records.get(session.id)!.turnId = "same-turn";
    gateway.event(session, "tool.start", { tool_id: "tool-1", name: "terminal", args: { text: secret } });
    gateway.event(session, "tool.complete", { tool_id: "tool-1", name: "terminal", result_text: `Echo ${secret}` });
    for (const type of ["message.delta", "reasoning.delta"]) {
      gateway.event(session, type, { text: "Echo DEMO_VALUE_" });
      gateway.event(session, type, { text: "90372!" });
    }
    gateway.event(session, "message.complete", { text: secret, reasoning: secret });
    await expect.poll(() => otherMessages.some((entry) => entry.type === "event" && entry.event.type === "message.completed")).toBe(true);
    session.messages.push({ id: 1, role: "assistant", content: secret, reasoning: secret }, { id: 2, role: "tool", content: secret });
    session.inflight = { user: "Frage", assistant: secret, thinking: secret, streaming: true };
    for (const entry of [manager, other]) {
      await entry.handle("tab", message({ op: "history.read", sessionId: session.id }));
      await entry.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    }
    for (const output of [messages, otherMessages]) {
      expect(JSON.stringify(output)).not.toContain(secret);
      expect(JSON.stringify(output)).toContain("Echo ***");
      for (const type of ["message.delta", "reasoning.delta"] as const) {
        const chunks = output.flatMap((entry) => entry.type === "event" && entry.event.type === type ? [entry.event.payload.text] : []);
        expect(chunks.join("")).toBe("Echo ***!");
      }
      expect(output.some((entry) => entry.type === "result" && entry.op === "history.read" && entry.data.messages[0]?.text === "***")).toBe(true);
      expect(output.some((entry) => entry.type === "result" && entry.op === "session.subscribe" && entry.data.snapshot.inflight?.assistant === "***")).toBe(true);
    }
    expect(JSON.stringify(pool.registry)).not.toContain(secret);
  });

  it("behält bekannte Secrets auch nach Entsorgung des antwortenden Managers", async () => {
    const { gateway, manager, pool, messages } = f;
    const session = gateway.seed("secret-after-idle");
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    gateway.request(session, "secret", { env_var: "DEMO" });
    await expect.poll(() => manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "secret", value: "OLD_ACCEPTED_VALUE" } }));
    manager.release("tab", "v2-disabled");
    await expect.poll(() => gateway.server.clients.size).toBe(0);
    const replacement = pool.get("ben");
    expect(replacement).not.toBe(manager);
    replacement.add({ id: "tab", send: (entry) => messages.push(entry) });
    session.messages.push({ id: 1, role: "assistant", content: "OLD_ACCEPTED_VALUE" });
    await replacement.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    expect(messages.at(-1)).toMatchObject({ type: "result", op: "session.subscribe", data: { snapshot: { messages: [{ text: "***" }] } } });
    expect(JSON.stringify(messages)).not.toContain("OLD_ACCEPTED_VALUE");
  });

  it("verwirft bei Secret-Kapazität keine bereits übertragenen Werte und sperrt vor Claim/Send", async () => {
    await f.close();
    f = await securityFixture({ secretValues: 1 });
    const { gateway, manager, messages } = f;
    const session = gateway.seed("secret-bound");
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    for (const [index, value] of ["FIRST_ACCEPTED_VALUE", "SECOND_REJECTED_VALUE"].entries()) {
      gateway.request(session, "secret", { env_var: "DEMO" }, `srq-${index}`);
      await expect.poll(() => manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
      const request = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
      await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "secret", value } }));
    }
    expect(messages.at(-1)).toMatchObject({ type: "error", code: "RATE_LIMITED", outcome: "not_sent" });
    expect(gateway.responses).toHaveLength(1);
    const request = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "secret", value: "FIRST_ACCEPTED_VALUE" } }));
    expect(gateway.responses).toHaveLength(2);
    gateway.event(session, "tool.complete", { tool_id: "t", name: "terminal", result_text: "FIRST_ACCEPTED_VALUE" });
    await expect.poll(() => messages.some((entry) => entry.type === "event" && entry.event.type === "tool.completed")).toBe(true);
    expect(JSON.stringify(messages)).not.toContain("FIRST_ACCEPTED_VALUE");
  });

  it("prüft Vault-Teilwerte atomar und unterdrückt Streaming bei ausgeschöpften Puffergrenzen", () => {
    const redactor = new SecretRedactor({ ...hermesV2Policy, secretValues: 1, secretStreams: 1 });
    expect(() => redactor.remember('{"identifier":"demo","password":"VAULT_VALUE"}')).toThrow(/ausgelastet/);
    redactor.remember("ONLY_ACCEPTED_VALUE");
    expect(redactor.stream("a", "ONLY_")).toBe("");
    expect(redactor.stream("b", "ONLY_")).toBe("***");
    expect(redactor.stream("a", "ACCEPTED_VALUE")).toBe("***");
    expect(redactor.scrub("ONLY_ACCEPTED_VALUE")).toBe("***");
  });

  it.each(["a", "once", "event"])("Secret '%s' maskiert Inhalte und erhält Protokoll, IDs, Choices und Modellkennungen", async (secret) => {
    const { gateway, manager, messages } = f;
    const session = gateway.seed("stored-a-once-event");
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    gateway.request(session, "secret", { env_var: "DEMO" });
    await expect.poll(() => manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const request = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await manager.handle("tab", message({ id: operationId, op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "secret", value: secret } }));
    expect(messages.at(-1)).toMatchObject({ type: "result", id: operationId, op: "request.respond", data: { status: "sent" } });
    gateway.event(session, "tool.complete", { tool_id: "tool-a-once-event", name: "terminal", result_text: secret });
    gateway.event(session, "message.delta", { text: secret });
    gateway.event(session, "message.complete", { text: secret, status: "once" });
    await expect.poll(() => messages.some((entry) => entry.type === "event" && entry.event.type === "message.completed")).toBe(true);
    expect(messages.findLast((entry) => entry.type === "event" && entry.event.type === "tool.completed")).toMatchObject({ type: "event", event: { type: "tool.completed", sessionId: session.id, epoch: gateway.epoch, payload: { toolId: "tool-a-once-event", output: "***" } } });
    expect(messages.findLast((entry) => entry.type === "event" && entry.event.type === "message.completed")).toMatchObject({ type: "event", event: { type: "message.completed", payload: { text: "***", status: "once" } } });
    session.title = secret.repeat(200).slice(0, 200);
    session.messages.push({ id: 1, role: "assistant", content: secret, message_uid: "a".repeat(32) });
    await manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    expect(messages.at(-1)).toMatchObject({ type: "result", op: "session.subscribe", data: { snapshot: {
      epoch: gateway.epoch, session: { id: session.id, model: "model-a", provider: "test" },
      selection: { provider: "test", model: "model-a" }, messages: expect.arrayContaining([expect.objectContaining({ id: "row:1", role: "assistant", text: "***", logicalId: "a".repeat(32) })]),
    } } });
    gateway.request(session, "approval", { command: secret, choices: ["once", "deny"] }, "srq-a-once");
    await expect.poll(() => manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    const approval = manager.sessions.records.get(session.id)!.snapshot.requests[0]!;
    expect(messages.findLast((entry) => entry.type === "event" && entry.event.type === "request.opened")).toMatchObject({ type: "event", event: { type: "request.opened", payload: { key: approval.key, kind: "approval", method: "approval", command: "***", choices: ["once", "deny"] } } });
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: approval.key, epoch: approval.epoch, response: { kind: "approval", choice: "once" } }));
    expect(gateway.responses.at(-1)).toMatchObject({ result: { choice: "once" } });
    await manager.handle("tab", message({ op: "catalog.read", sessionId: session.id }));
    expect(messages.at(-1)).toMatchObject({ type: "result", op: "catalog.read", data: { models: { providers: [{ id: "test", models: [{ id: "model-a" }, { id: "model-b" }] }] } } });
    expect(messages.some((entry) => entry.type === "error" && entry.code === "PROTOCOL_MISMATCH")).toBe(false);
  });

  it("hält nach Epochwechsel eine wiederverwendete True-Flag-Runtime bis zum tatsächlichen Settlement", async () => {
    const { gateway, manager, messages } = f;
    await manager.handle("tab", message({ op: "session.create", projectId: null }));
    const created = messages.findLast((entry) => entry.type === "result" && entry.op === "session.create");
    if (created?.type !== "result" || created.op !== "session.create") throw new Error("Create fehlt");
    const id = created.data.snapshot.session.id;
    const session = gateway.sessions.get(id)!;
    await manager.handle("tab", message({ op: "message.submit", sessionId: id, text: "Fake-Turn" }));
    expect(manager.sessions.records.get(id)?.ownedBinding).toEqual({ epoch: "epoch-1", liveId: session.liveId });
    gateway.disconnect("epoch-2");
    // Das neue Backend hat dieselbe Stored-ID bereits als fremde Live-Session mit True-Flag.
    session.closeOnDisconnect = true;
    await expect.poll(() => messages.some((entry) => entry.type === "snapshot" && entry.snapshot.epoch === "epoch-2")).toBe(true);
    expect(manager.sessions.records.get(id)?.ownedBinding).toBeNull();
    const classic = new WebSocket(`ws://${f.deps.authority}/api/ws?token=${gateway.token}`);
    const attached = new Promise<void>((resolve) => classic.on("message", (raw) => {
      const frame = JSON.parse(raw.toString()) as { id?: unknown };
      if (frame.id === "classic-resume") resolve();
    }));
    await once(classic, "open");
    classic.send(JSON.stringify({ jsonrpc: "2.0", id: "classic-resume", method: "session.resume", params: { session_id: id, close_on_disconnect: true } }));
    await attached;
    classic.close();
    await once(classic, "close");
    await expect.poll(() => gateway.server.clients.size).toBe(1);
    manager.release("tab", "v2-disabled");
    expect(manager.retainRuntime).toBe(true);
    expect(gateway.server.clients.size).toBe(1);
    expect(session.running).toBe(true);
    expect(gateway.calls.some((entry) => entry.method === "session.interrupt")).toBe(false);
    session.running = false;
    gateway.event(session, "message.complete", { text: "Fertig" });
    await expect.poll(() => gateway.server.clients.size).toBe(0);
  });

  it("akzeptiert einen Eigentumsnachweis nicht für eine andere Live-ID in derselben Epoche", async () => {
    const { manager, messages } = f;
    await manager.handle("tab", message({ op: "session.create", projectId: null }));
    const created = messages.findLast((entry) => entry.type === "result" && entry.op === "session.create");
    if (created?.type !== "result" || created.op !== "session.create") throw new Error("Create fehlt");
    const record = manager.sessions.records.get(created.data.snapshot.session.id)!;
    record.liveId = "foreign-live-same-epoch";
    record.snapshot.running = true;
    manager.release("tab", "v2-disabled");
    expect(manager.retainRuntime).toBe(true);
  });
});
