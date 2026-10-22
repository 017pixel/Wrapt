// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { approval, clarify, otherRequestKey, requestKey, secret } from "./chat-request-test-fixtures";
import type { HermesV2Request } from "./chat-types";

describe("Gemeinsame lokale Hermes-Anfrageaktionen", () => {
  let runtime: ChatRuntime, gateway: TestGateway;
  const owner = (ownerId: string, sessionId = "a") => ({ ownerId, sessionId, onSelectSession: vi.fn(), active: true, visible: true });
  const actions = (id = "one") => runtime.actionsFor(id);
  const states = (id = "one") => runtime.owners.getView(id).requestStates;
  const writes = () => gateway.sent.filter((frame) => frame.op === "request.respond" || frame.op === "request.lock");
  const open = async (request: HermesV2Request, aliases = false) => {
    gateway.snapshots.set("a", snapshot("a", { requests: [request] }));
    gateway.snapshots.set("b", snapshot("b", { requests: [{ ...request, sessionId: "b" }] }));
    runtime.acquire(owner("one")); runtime.acquire(owner("two", aliases ? "b" : "a")); await settle();
  };
  beforeEach(() => { vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); runtime = new ChatRuntime(gateway.createClient()); });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });

  it.each([false, true])("sperrt synchrone Doppelantworten über zwei Owner, Alias=%s", async (aliases) => {
    const request = approval(); await open(request, aliases);
    const one = actions().respond(request, { kind: "approval", choice: "once" });
    const two = actions("two").respond(aliases ? { ...request, sessionId: "b" } : request, { kind: "approval", choice: "deny" });
    expect(states()).toEqual([{ key: requestKey, epoch: "epoch", status: "pending" }]); expect(states("two")).toEqual(states());
    await one; await two; expect(writes()).toHaveLength(1);
    expect(states()).toEqual([{ key: requestKey, epoch: "epoch", status: "pending" }]);
    await actions("two").respond(aliases ? { ...request, sessionId: "b" } : request, { kind: "approval", choice: "once" });
    expect(writes()).toHaveLength(1);
    gateway.socket.event(event("request.closed", 1, { requestKey, reason: "answered" })); await settle();
    expect(states()).toEqual([]); expect(states("two")).toEqual([]);
    if (aliases) expect(runtime.store.get("b").requests).toEqual([]);
  });

  it("Respond und Lock derselben Anfrage teilen die Grenze; andere Anfrage bleibt unabhängig", async () => {
    const request = clarify(); await open(request);
    const other = approval("a", { key: otherRequestKey });
    gateway.socket.event(event("request.opened", 1, other));
    const first = actions().lockRequest(request, "q1", "A");
    const duplicate = actions("two").respond(request, { kind: "cancel" });
    const independent = actions("two").respond(other, { kind: "approval", choice: "once" });
    await Promise.all([first, duplicate, independent]);
    expect(writes().map((frame) => frame.op)).toEqual(["request.lock", "request.respond"]);
  });

  it("Lock wartet auf den Snapshot, bestätigt null und erlaubt danach die nächste Frage", async () => {
    const request = clarify(); await open(request);
    let release!: () => void;
    gateway.handle = (frame, socket) => {
      if (frame.op === "request.lock") {
        gateway.snapshots.set("a", snapshot("a", { requests: [clarify("a", { lockedAnswers: { q1: null } })] }));
        socket.result(frame, { remaining: ["q2"], settled: false }); return true;
      }
      if (frame.op === "session.subscribe") { release = () => socket.result(frame, { snapshot: gateway.snapshots.get("a") }); return true; }
      return false;
    };
    const pending = actions().lockRequest(request, "q1", null); await settle();
    expect(states()[0]?.status).toBe("pending");
    expect(runtime.store.get("a").requests[0]).toMatchObject({ lockedAnswers: {} });
    release(); await pending; expect(states()).toEqual([]);
    expect(runtime.store.get("a").requests[0]).toMatchObject({ lockedAnswers: { q1: null } });
    gateway.handle = null;
    await actions().respond(request, { kind: "clarify", answers: { q1: "veraltet", q2: "Freitext" } });
    expect(writes().at(-1)).toMatchObject({ op: "request.respond", response: { kind: "clarify", answers: { q1: null, q2: "Freitext" } } });
  });

  it("letzter Lock kann den Request im folgenden Snapshot schließen", async () => {
    const request = clarify("a", { lockedAnswers: { q1: "A" } }); await open(request);
    gateway.handle = (frame, socket) => {
      if (frame.op !== "request.lock") return false;
      gateway.snapshots.set("a", snapshot("a")); socket.result(frame, { remaining: [], settled: true }); return true;
    };
    await actions().lockRequest(request, "q2", "Fertig");
    expect(states()).toEqual([]); expect(runtime.store.get("a").requests).toEqual([]);
  });

  it.each(["q1", "foreign"])("sendet keinen Lock für bereits bestätigte oder fremde Frage %s", async (question) => {
    const request = clarify("a", { lockedAnswers: { q1: null } }); await open(request);
    await actions().lockRequest(request, question, "A");
    expect(writes()).toEqual([]); expect(states()).toEqual([]); expect(runtime.owners.getView("one").actionError?.code).toBe("STALE_REQUEST");
  });

  it.each(["once", "deny"] as const)("sendet angebotene Approvalentscheidung %s ohne erfundene Optionen", async (choice) => {
    const request = approval(); await open(request); await actions().respond(request, { kind: "approval", choice });
    expect(writes()[0]).toMatchObject({ response: { kind: "approval", choice } });
  });

  it("verwirft eine nicht angebotene dauerhafte Entscheidung vor Send", async () => {
    const request = approval(); await open(request); await actions().respond(request, { kind: "approval", choice: "always" });
    expect(writes()).toEqual([]); expect(states()).toEqual([]);
  });

  it.each(["secret", "sudo", "vault.code", "vault.unlock_prompt", "vault.save_login"] as const)("hält %s-Werte aus Store, Fehler und Retryzustand fern", async (method) => {
    const request = secret("a", method); await open(request);
    const value = method === "vault.save_login" ? JSON.stringify({ identifier: "fixture-user", password: "synthetic-secret" }) : "synthetic-secret";
    gateway.handle = (frame) => frame.op === "request.respond";
    const pending = actions().respond(request, { kind: "secret", value }); await settle();
    gateway.socket.drop(); await pending;
    expect(states()).toEqual([{ key: requestKey, epoch: "epoch", status: "unknown" }]);
    expect(states("two")).toEqual(states());
    expect(JSON.stringify({ state: runtime.store.get("a"), view: runtime.owners.getView("one"), statuses: states() })).not.toContain("synthetic-secret");
    expect(runtime.owners.getView("one").unknownSend).toBeNull();
    expect(runtime.owners.records.get("one")!.drafts.get("a")!.unknown).toBeNull();
    expect(writes()).toHaveLength(1);
  });

  it("übernimmt keinen freien Serverfehlertext in den Antwortzustand", async () => {
    const request = secret(); await open(request);
    gateway.handle = (frame, socket) => {
      if (frame.op !== "request.respond") return false;
      socket.receive({ v: 1, type: "error", id: frame.id, code: "STALE_REQUEST", message: "synthetic-secret", outcome: "not_sent", retryable: false }); return true;
    };
    await actions().respond(request, { kind: "secret", value: "synthetic-secret" });
    expect(states()).toEqual([]); expect(runtime.owners.getView("one").actionError?.code).toBe("STALE_REQUEST");
    expect(JSON.stringify(runtime.owners.getView("one"))).not.toContain("synthetic-secret");
  });
});
