// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { approval, clarify, requestKey } from "./chat-request-test-fixtures";
import { chatPolicy } from "./chat-policy";

describe("Anfrage-Lifecycle vor und nach autorisiertem Send", () => {
  let runtime: ChatRuntime, gateway: TestGateway;
  const owner = (ownerId: string, sessionId = "a") => ({ ownerId, sessionId, onSelectSession: vi.fn(), active: true, visible: true });
  const actions = (id = "one") => runtime.actionsFor(id);
  const states = (id = "one") => runtime.owners.getView(id).requestStates;
  const writes = () => gateway.sent.filter((frame) => frame.op === "request.respond" || frame.op === "request.lock");
  const initialize = async (alias = false) => {
    gateway.snapshots.set("a", snapshot("a", { requests: [approval()] }));
    gateway.snapshots.set("b", snapshot("b", { requests: [approval("b")] }));
    const close = runtime.acquire(owner("one")); runtime.acquire(owner("two", alias ? "b" : "a")); await settle();
    return close;
  };
  beforeEach(() => { vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); runtime = new ChatRuntime(gateway.createClient()); });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });

  it.each(["cancel", "epoch", "session", "release", "hidden", "parked", "document", "readonly"] as const)("prüft %s nach asynchroner Vorbereitung erneut", async (change) => {
    const close = await initialize();
    const pending = actions().respond(approval(), { kind: "approval", choice: "once" });
    expect(states()[0]?.status).toBe("pending");
    if (change === "cancel") gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a") });
    if (change === "epoch") gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { epoch: "new-epoch", requests: [approval("a", { epoch: "new-epoch" })] }) });
    if (change === "session") actions().selectSession("b");
    if (change === "release") close();
    if (change === "hidden") runtime.update({ ...owner("one"), visible: false });
    if (change === "parked") runtime.update({ ...owner("one"), active: false });
    if (change === "document") vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    if (change === "readonly") gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { requests: [approval()], writable: false }) });
    await pending; await settle(); expect(writes()).toEqual([]);
    expect(states("two")).toEqual([]);
  });

  it.each(["key", "epoch", "session"] as const)("verwirft bereits übergebene stale Karte mit anderem %s", async (change) => {
    await initialize();
    const request = approval(change === "session" ? "b" : "a", change === "key" ? { key: crypto.randomUUID() } : change === "epoch" ? { epoch: "old" } : {});
    await actions().respond(request, { kind: "approval", choice: "once" });
    expect(writes()).toEqual([]); expect(runtime.owners.getView("one").actionError?.code).toBe("STALE_REQUEST");
  });

  for (const alias of [false, true]) {
    it.each(["success", "not_sent", "unknown"] as const)(`behält gemeinsame Sendverantwortung nach Ausstieg von A, Alias=${alias}, Ausgang=%s`, async (outcome) => {
      const close = await initialize(alias); let frame!: HermesV2ClientMessage;
      gateway.handle = (value) => { if (value.op !== "request.respond") return false; frame = value; return true; };
      const pending = actions().respond(approval(), { kind: "approval", choice: "once" }); await settle();
      close(); await settle(); expect(states("two")[0]?.status).toBe("pending");
      if (outcome === "success") {
        const selected = alias ? "b" : "a"; gateway.snapshots.set(selected, snapshot(selected)); gateway.socket.result(frame, { status: "sent" });
      } else gateway.socket.receive({ v: 1, type: "error", id: frame.id, code: "REQUEST_CLAIMED", message: "Interner Fixturetext", outcome, retryable: false });
      await pending; await settle(); expect(writes()).toHaveLength(1);
      expect(states("two")).toEqual(outcome === "unknown" ? [{ key: requestKey, epoch: "epoch", status: "unknown" }] : []);
      expect(runtime.owners.records.has("one")).toBe(false);
    });
  }

  it.each([false, true])("Flag-off beendet alte Status-/Cleanupfortsetzungen, Reenable=%s", async (reenable) => {
    await initialize(); let frame!: HermesV2ClientMessage;
    gateway.handle = (value) => { if (value.op !== "request.respond") return false; frame = value; return true; };
    const pending = actions().respond(approval(), { kind: "approval", choice: "once" }); await settle();
    const old = gateway.socket, oldFrame = frame; useAppPreferences.setState({ hermesV2Enabled: false });
    if (reenable) {
      useAppPreferences.setState({ hermesV2Enabled: true }); runtime.acquire(owner("one")); await settle();
      const next = actions().respond(approval(), { kind: "approval", choice: "deny" }); await settle();
      const count = gateway.sent.length; old.result(oldFrame, { status: "sent" }); await pending; await settle();
      expect(gateway.sent).toHaveLength(count); expect(states()[0]?.status).toBe("pending");
      runtime.dispose("v2-disabled"); await next;
    } else {
      const count = gateway.sent.length; old.result(oldFrame, { status: "sent" }); await pending;
      expect(gateway.sent).toHaveLength(count); expect(runtime.owners.records.size).toBe(0);
    }
  });

  it("alte Fehler und Cleanup überschreiben weder neue Epoche noch neuen gleichnamigen Eintrag", async () => {
    await initialize(); const frames: HermesV2ClientMessage[] = [];
    gateway.handle = (frame) => { if (frame.op !== "request.respond") return false; frames.push(frame); return true; };
    const first = actions().respond(approval(), { kind: "approval", choice: "once" }); await settle();
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { epoch: "next", requests: [approval("a", { epoch: "next" })] }) });
    const second = actions().respond(approval("a", { epoch: "next" }), { kind: "approval", choice: "deny" }); await settle();
    gateway.socket.receive({ v: 1, type: "error", id: frames[0]!.id, code: "STALE_REQUEST", message: "Alt", outcome: "unknown", retryable: false }); await first;
    expect(states()).toEqual([{ key: requestKey, epoch: "next", status: "pending" }]);
    expect(runtime.owners.getView("one").actionError).toBeNull();
    runtime.dispose("v2-disabled"); await second;
  });

  it("verlorene Antwort bleibt nach aktuellem weiterhin offenem Snapshot gesperrt, ohne automatisches Replay", async () => {
    await initialize(); gateway.handle = (frame) => frame.op === "request.respond";
    const pending = actions().respond(approval(), { kind: "approval", choice: "once" }); await settle(); gateway.socket.drop(); await pending;
    await vi.advanceTimersByTimeAsync(chatPolicy.retryInitialMs); await settle(); await runtime.resync(runtime.owners.records.get("one")!);
    expect(states()[0]?.status).toBe("unknown");
    await actions("two").respond(approval(), { kind: "approval", choice: "deny" }); expect(writes()).toHaveLength(1);
    gateway.socket.event(event("request.closed", 1, { requestKey, reason: "cancelled" })); expect(states()).toEqual([]);
  });

  it("prüft Sichtbarkeit auch im Microtaskfenster nach abgeschlossener Vorbereitung", async () => {
    await initialize(); const ready = runtime.client.ready.bind(runtime.client);
    vi.spyOn(runtime.client, "ready").mockImplementation(async (priority) => {
      await ready(priority);
      if (priority) queueMicrotask(() => queueMicrotask(() => runtime.update({ ...owner("one"), visible: false })));
    });
    await actions().respond(approval(), { kind: "approval", choice: "once" });
    expect(writes()).toEqual([]); expect(states()).toEqual([]);
  });

  it("nach Send betrifft ein Sessionwechsel nur die Auswahl, nicht Bs gemeinsamen Unknownstatus", async () => {
    await initialize(); gateway.snapshots.set("b", snapshot("b"));
    gateway.handle = (frame) => frame.op === "request.respond";
    const pending = actions().respond(approval(), { kind: "approval", choice: "once" }); await settle();
    actions().selectSession("b"); actions().setDraft("Neuer Entwurf"); await settle(); gateway.socket.drop(); await pending;
    expect(states()).toEqual([]); expect(states("two")[0]?.status).toBe("unknown");
    expect(runtime.owners.getView("one")).toMatchObject({ draft: "Neuer Entwurf", actionError: null });
  });

  it("begrenzt gemeinsame Einträge und leert sie bei Dispose ohne Antwortwerte", async () => {
    const a = Array.from({ length: 80 }, () => approval("a", { key: crypto.randomUUID() }));
    const b = Array.from({ length: 80 }, () => approval("b", { key: crypto.randomUUID() }));
    gateway.snapshots.set("a", snapshot("a", { requests: a })); gateway.snapshots.set("b", snapshot("b", { requests: b }));
    runtime.acquire(owner("one")); runtime.acquire(owner("two", "b")); await settle();
    gateway.handle = (frame) => frame.op === "request.respond";
    const pending = [...a.map((request) => actions().respond(request, { kind: "approval", choice: "once" })),
      ...b.map((request) => actions("two").respond(request, { kind: "approval", choice: "deny" }))];
    expect(states().length + states("two").length).toBe(chatPolicy.maxPending);
    await settle(); expect(writes().length).toBeLessThanOrEqual(chatPolicy.maxPending);
    runtime.dispose("v2-disabled"); await Promise.all(pending); expect(states()).toEqual([]); expect(states("two")).toEqual([]);
  });

  it("ein unklarer Lock wird erst durch autoritatives lockedAnswers für weitere Fragen frei", async () => {
    gateway.snapshots.set("a", snapshot("a", { requests: [clarify()] })); runtime.acquire(owner("one")); await settle();
    gateway.handle = (frame) => frame.op === "request.lock";
    const pending = actions().lockRequest(clarify(), "q1", "A"); await settle(); gateway.socket.drop(); await pending;
    expect(states()[0]?.status).toBe("unknown");
    gateway.snapshots.set("a", snapshot("a", { requests: [clarify("a", { lockedAnswers: { q1: "A" } })] }));
    await vi.advanceTimersByTimeAsync(chatPolicy.retryInitialMs); await settle(); expect(states()).toEqual([]);
    expect(writes()).toHaveLength(1);
  });

  it.each(["timeout", "send-throw"] as const)("hält lokalen möglichen Sendverlust durch %s ohne Replay fest", async (failure) => {
    await initialize(); gateway.handle = (frame) => frame.op === "request.respond";
    if (failure === "send-throw") gateway.socket.throwOnSend = true;
    const pending = actions().respond(approval(), { kind: "approval", choice: "once" }); await settle();
    if (failure === "timeout") await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs);
    await pending; expect(states()[0]?.status).toBe("unknown");
    await actions().respond(approval(), { kind: "approval", choice: "once" }); expect(writes()).toHaveLength(1);
  });

  it("verlorener Bestätigungsread nach akzeptiertem Respond gibt die Anfrage nicht wieder frei", async () => {
    await initialize();
    gateway.handle = (frame, socket) => {
      if (frame.op !== "session.subscribe") return false;
      socket.receive({ v: 1, type: "error", id: frame.id, code: "GATEWAY_OFFLINE", message: "Abgleich fehlgeschlagen", outcome: "not_sent", retryable: true }); return true;
    };
    await actions().respond(approval(), { kind: "approval", choice: "once" });
    expect(states()[0]?.status).toBe("unknown"); expect(states("two")).toEqual(states());
    expect(runtime.owners.getView("one").actionError?.outcome).toBe("unknown"); expect(writes()).toHaveLength(1);
  });
});
