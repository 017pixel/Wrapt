// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { chatPolicy } from "./chat-policy";
import { event, inflight, row, settle, snapshot, TestGateway } from "./chat-test-fixtures";

describe("Snapshot-, History- und Budget-Races", () => {
  let gateway: TestGateway;
  let runtime: ChatRuntime;
  const options = { ownerId: "owner", sessionId: "a", onSelectSession: () => {} };
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); runtime = new ChatRuntime(gateway.createClient());
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  it("entwertet alte History und Catalog nach einer Snapshot-Barriere mit kleinerem Cursor", async () => {
    const held: HermesV2ClientMessage[] = [];
    gateway.handle = (frame) => { if (frame.op === "history.read" || frame.op === "catalog.read") { held.push(frame); return true; } return false; };
    runtime.acquire(options); await settle();
    gateway.socket.event(event("message.delta", 90, { turnId: "old", text: "alt" }));
    const actions = runtime.actionsFor("owner");
    const reads = [actions.loadOlder(), actions.readCatalog()]; await settle();
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { cursor: 1, messages: [row(10, "neu")] }) });
    for (const frame of held) {
      if (frame.op === "history.read") gateway.socket.result(frame, { sessionId: "a", messages: [row(2, "veraltet")], offset: 0, returned: 1, hasMore: false });
      if (frame.op === "catalog.read") gateway.socket.result(frame, { commands: [], models: { providers: [], current: { provider: "old", model: "old" } } });
    }
    await Promise.all(reads);
    expect(runtime.store.get("a").messages.map((message) => message.text)).toEqual(["neu"]);
    expect(runtime.store.get("a").catalog.models).toBeNull();
    expect(runtime.store.get("a").cursor).toBe(1);
  });
  it("lässt einen alten Subscribe-Response keinen neueren Pushsnapshot überschreiben", async () => {
    let subscribe: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "session.subscribe") { subscribe = frame; return true; } return false; };
    runtime.acquire(options); await settle();
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { cursor: 2, messages: [row(2, "neu")] }) });
    gateway.socket.result(subscribe!, { snapshot: snapshot("a", { cursor: 99, messages: [row(1, "alt")] }) });
    await settle();
    expect(runtime.store.get("a").messages.map((message) => message.text)).toEqual(["neu"]);
    expect(runtime.store.get("a").writable).toBe(true);
  });
  it("ordnet gepufferte Events hinter den Subscribe-Snapshot und addiert rekonstruierte Deltas nicht doppelt", async () => {
    let subscribe: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "session.subscribe") { subscribe = frame; return true; } return false; };
    runtime.acquire(options); await settle();
    gateway.socket.event(event("message.delta", 1, { turnId: "t", text: "Alt" }));
    gateway.socket.event(event("message.delta", 2, { turnId: "t", text: " neu" }));
    gateway.socket.result(subscribe!, { snapshot: snapshot("a", { cursor: 1, inflight, running: true }) });
    await settle();
    expect(runtime.store.get("a").messages.at(-1)?.text).toBe("Alt neu");
  });
  it("nutzt nach Eventbuffer-Überlauf einen neuen autoritativen Snapshot", async () => {
    let first: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "session.subscribe" && !first) { first = frame; return true; } return false; };
    runtime.acquire(options); await settle();
    for (let seq = 1; seq <= chatPolicy.maxBufferedEvents + 1; seq++) gateway.socket.event(event("message.delta", seq, { turnId: "t", text: "x" }));
    gateway.snapshots.set("a", snapshot("a", { cursor: chatPolicy.maxBufferedEvents + 1, inflight: { ...inflight, assistant: "rekonstruiert" }, running: true }));
    gateway.socket.result(first!, { snapshot: snapshot("a", { cursor: 0 }) });
    await settle();
    expect(gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(2);
    expect(runtime.store.get("a").messages.at(-1)?.text).toBe("rekonstruiert");
  });
  it("primt den fehlenden Snapshot-Rawoffset und coalesced parallele Older-Aktionen", async () => {
    gateway.snapshots.set("a", snapshot("a", { messages: [row(3, "neu")] }));
    gateway.pages.set("a:0", [row(3, "neu")]);
    gateway.pages.set("a:1", [row(1, "gleich"), row(2, "gleich")]);
    runtime.acquire(options); await settle();
    const actions = runtime.actionsFor("owner");
    await Promise.all([actions.loadOlder(), actions.loadOlder()]);
    expect(gateway.sent.filter((frame) => frame.op === "history.read").map((frame) => frame.offset)).toEqual([0, 1]);
    expect(runtime.store.get("a").messages.map((message) => message.rowId)).toEqual([1, 2, 3]);
  });
  it("hält Stop bei Pending-Submit und wartendem Abgleich in der Budgetreserve erreichbar", async () => {
    runtime.acquire(options); await settle();
    while (gateway.sent.length < chatPolicy.rotateAt - 1) await runtime.client.request({ op: "sessions.list" });
    let submit: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "message.submit") { submit = frame; return true; } return false; };
    const actions = runtime.actionsFor("owner"); actions.setDraft("einmal");
    const pending = actions.submit(); await settle();
    await actions.stop(); await settle();
    await actions.stop(); await settle();
    expect(gateway.sent.filter((frame) => frame.op === "session.stop")).toHaveLength(2);
    expect(gateway.sockets).toHaveLength(1);
    gateway.socket.result(submit!, { status: "queued", userRowId: null });
    await pending; await settle();
    expect(gateway.sockets).toHaveLength(2);
    expect(runtime.store.get("a").writable).toBe(true);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("verliert bei einem neuen Socket keine Sessionlisten-Invalidierung hinter einem alten Read", async () => {
    let first = true;
    gateway.handle = (frame) => { if (frame.op === "sessions.list" && first) { first = false; return true; } return false; };
    runtime.acquire(options); await settle();
    gateway.snapshots.set("b", snapshot("b"));
    gateway.socket.drop();
    await vi.advanceTimersByTimeAsync(chatPolicy.retryInitialMs); await settle();
    expect(runtime.store.getList().items.some((session) => session.id === "b")).toBe(true);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
  });
  it("hält verlorene Secretantworten unknown ohne Resendtext oder Replay", async () => {
    const request = { key: "b3b8476c-75a1-4abf-9017-3b97211d44bb", epoch: "epoch", sessionId: "a", createdAt: 1,
      kind: "secret" as const, method: "secret" as const, label: "Test", hint: "" };
    gateway.snapshots.set("a", snapshot("a", { requests: [request] }));
    gateway.handle = (frame) => frame.op === "request.respond";
    runtime.acquire(options); await settle();
    const actions = runtime.actionsFor("owner");
    const pending = actions.respond(request, { kind: "secret", value: "nur-fixture-secret" });
    await settle(); gateway.socket.drop(); await pending;
    expect(runtime.owners.getView("owner").requestStates).toEqual([{ key: request.key, epoch: request.epoch, status: "unknown" }]);
    expect(runtime.owners.getView("owner").unknownSend).toBeNull();
    expect(runtime.owners.capture("owner").draft.unknown).toBeNull();
    await vi.advanceTimersByTimeAsync(chatPolicy.retryInitialMs); await settle();
    expect(gateway.sent.filter((frame) => frame.op === "request.respond")).toHaveLength(1);
  });
  it("lässt einen ebenfalls verlorenen Stop den unknown-Submit nicht überschreiben", async () => {
    gateway.handle = (frame) => frame.op === "message.submit" || frame.op === "session.stop";
    runtime.acquire(options); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("Original");
    const submit = actions.submit(); await settle(); const stop = actions.stop(); await settle();
    gateway.socket.drop(); await Promise.all([submit, stop]);
    expect(runtime.owners.getView("owner").unknownSend?.operation).toBe("message.submit");
    await actions.submit();
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("sendet nach explizitem Resync und bestätigter Doppelwirkungswarnung bewusst genau einmal erneut", async () => {
    gateway.handle = (frame) => frame.op === "message.submit";
    runtime.acquire(options); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("Original");
    const pending = actions.submit(); await settle();
    await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs); await pending;
    await actions.resync(); gateway.handle = null;
    await actions.resendUnknown({ acknowledgeDuplicateRisk: true });
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(2);
    expect(runtime.owners.getView("owner")).toMatchObject({ draft: "", unknownSend: null });
  });
  it("hält zwei getrennte Tab-Runtimes ohne gemeinsame globale Auswahl", async () => {
    const second = new ChatRuntime(gateway.createClient());
    try {
      runtime.acquire(options); second.acquire({ ...options, sessionId: "b" }); await settle();
      expect(gateway.sockets).toHaveLength(2);
      runtime.actionsFor("owner").setDraft("Tab A"); second.actionsFor("owner").setDraft("Tab B");
      expect(runtime.owners.getView("owner").sessionId).toBe("a");
      expect(second.owners.getView("owner").draft).toBe("Tab B");
      runtime.dispose("v2-navigation");
      expect(second.client.getSnapshot().state).toBe("online");
    } finally { second.dispose("v2-navigation"); }
  });
});
