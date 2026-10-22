import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ServerMessage } from "@wrapt/contracts/hermes-v2";
import { clientMessage as message, securityFixture, type SecurityFixture } from "./security-test.fixture.js";
import type { GatewayUpstream } from "./upstream.js";

describe("Security: verlorene Antworten und Send-Grenze", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { await f.close(); vi.restoreAllMocks(); });

  async function openRequest(method = "approval") {
    const session = f.gateway.seed("request-session");
    await f.manager.handle("tab", message({ op: "session.subscribe", sessionId: session.id }));
    f.gateway.request(session, method, method === "clarify" ? { questions: [{ qid: "q1", question: "Welche?" }] } : { choices: ["once", "deny"] });
    await expect.poll(() => f.manager.sessions.records.get(session.id)?.snapshot.requests.length).toBe(1);
    return { session, request: f.manager.sessions.records.get(session.id)!.snapshot.requests[0]! };
  }

  it("erlaubt nach verlorener Antwort, Transportende und autoritativem Reconnect einen bewussten neuen Versuch", async () => {
    const { gateway, manager, messages } = f;
    const { session, request } = await openRequest();
    const before = manager.upstream.transportId;
    gateway.dropResponse = true;
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } }));
    await expect.poll(() => messages.some((entry) => entry.type === "snapshot")).toBe(true);
    expect(manager.upstream.transportId).not.toBe(before);
    expect(manager.upstream.epoch).toBe(request.epoch);
    expect(manager.sessions.records.get(session.id)?.snapshot.requests[0]?.key).toBe(request.key);
    expect(gateway.responses).toHaveLength(0);
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "deny" } }));
    expect(gateway.responses).toHaveLength(1);
    expect(gateway.responses[0]).toMatchObject({ result: { choice: "deny" } });
    expect(messages.at(-1)).toMatchObject({ type: "result", op: "request.respond" });
  });

  it("wiederholt nach Classic-Settlement auch nach Transportverlust keine alte Antwort", async () => {
    const { gateway, manager, messages } = f;
    const { session, request } = await openRequest();
    gateway.dropResponse = true;
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } }));
    session.requests = [];
    await expect.poll(() => messages.some((entry) => entry.type === "snapshot")).toBe(true);
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "deny" } }));
    expect(gateway.responses).toHaveLength(0);
    expect(messages.at(-1)).toMatchObject({ type: "error", code: "STALE_REQUEST" });
  });

  it("löst keinen noch aktiven fremden Send und erlaubt Recovery erst nach dessen Transportende", async () => {
    const { gateway, manager, pool } = f;
    const { session, request } = await openRequest();
    const other = pool.get("admin");
    const otherMessages: HermesV2ServerMessage[] = [];
    other.add({ id: "other", send: (value) => otherMessages.push(value) });
    await other.handle("other", message({ op: "session.subscribe", sessionId: session.id }));
    vi.spyOn(manager.upstream, "respond").mockResolvedValue(undefined);
    await manager.handle("tab", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "once" } }));
    const second = () => other.handle("other", message({ op: "request.respond", sessionId: session.id, requestKey: request.key, epoch: request.epoch, response: { kind: "approval", choice: "deny" } }));
    await second();
    expect(otherMessages.at(-1)).toMatchObject({ type: "error", code: "REQUEST_CLAIMED" });
    expect(gateway.responses).toHaveLength(0);
    manager.upstream.dispose();
    expect(gateway.responses).toHaveLength(0);
    await second();
    expect(otherMessages.at(-1)).toMatchObject({ type: "result", op: "request.respond" });
    expect(gateway.responses).toHaveLength(1);
  });

  const operations = [
    { op: "message.submit", fields: { text: "Neu" }, method: "prompt.submit", trigger: "session.activate" },
    { op: "session.stop", fields: {}, method: "session.interrupt", trigger: "session.activate" },
    { op: "session.steer", fields: { text: "Neu" }, method: "session.steer", trigger: "session.activate" },
    { op: "model.select", fields: { selection: { provider: "test", model: "model-b" } }, method: "config.set", trigger: "model.options" },
    { op: "request.respond", fields: { response: { kind: "approval", choice: "once" } }, method: null, trigger: "session.events.since" },
    { op: "request.lock", fields: { questionId: "q1", answer: "A" }, method: "clarify.lock", trigger: "session.events.since" },
  ];

  for (const ending of ["v2-disabled", "navigation", "unsubscribe", "flag-off", "live-change", "epoch-change"] as const) {
    it.each(operations)(`${ending} während des letzten Preflights verhindert $op`, async ({ op, fields, method, trigger }) => {
      const { gateway, manager, control, messages } = f;
      const { session, request } = await openRequest(op === "request.lock" ? "clarify" : "approval");
      session.running = true;
      const record = manager.sessions.records.get(session.id)!;
      record.snapshot.running = true;
      const call = manager.upstream.call.bind(manager.upstream);
      let ended = false;
      vi.spyOn(manager.upstream, "call").mockImplementation(async (...args: Parameters<GatewayUpstream["call"]>) => {
        const result = await call(...args);
        if (!ended && args[0] === trigger) {
          ended = true;
          if (ending === "unsubscribe") record.subscribers.delete("tab");
          else if (ending === "flag-off") control.enabled = false;
          else if (ending === "live-change") record.liveId = "different-live";
          else if (ending === "epoch-change") record.epoch = "different-epoch";
          else manager.release("tab", ending);
        }
        return result;
      });
      await manager.handle("tab", message({ op, sessionId: session.id, ...(op.startsWith("request.") ? { requestKey: request.key, epoch: request.epoch } : {}), ...fields }));
      expect(ended).toBe(true);
      expect(gateway.calls.filter((entry) => entry.method === method)).toHaveLength(0);
      expect(gateway.responses).toHaveLength(0);
      expect(session.running).toBe(true);
      if (ending === "v2-disabled" || ending === "navigation") expect(manager.retainRuntime).toBe(true);
      if (ending === "flag-off") expect(messages.at(-1)).toMatchObject({ type: "error", outcome: "not_sent" });
    });
  }

  it.each(["v2-disabled", "navigation", "flag-off"] as const)("%s während CWD-Auflösung verhindert Create", async (ending) => {
    const { gateway, manager, deps, control } = f;
    deps.resolveProjectCwd = async () => {
      if (ending === "flag-off") control.enabled = false;
      else manager.release("tab", ending);
      return f.root;
    };
    await manager.handle("tab", message({ op: "session.create", projectId: null }));
    expect(gateway.calls.some((entry) => entry.method === "session.create")).toBe(false);
    expect(gateway.sessions.size).toBe(0);
  });

  it("verhindert Create auch nach Abmeldung während der Modellkatalog-Prüfung", async () => {
    const { gateway, manager } = f;
    const call = manager.upstream.call.bind(manager.upstream);
    vi.spyOn(manager.upstream, "call").mockImplementation(async (...args: Parameters<GatewayUpstream["call"]>) => {
      const result = await call(...args);
      if (args[0] === "model.options") manager.release("tab", "v2-disabled");
      return result;
    });
    await manager.handle("tab", message({ op: "session.create", projectId: null, selection: { provider: "test", model: "model-b" } }));
    expect(gateway.calls.some((entry) => entry.method === "session.create")).toBe(false);
  });
});
