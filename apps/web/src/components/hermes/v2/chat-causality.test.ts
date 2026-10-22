// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { applyChatEvent } from "./chat-events";
import { applyChatHistory, applyChatSnapshot, emptyChatSession, optimisticUser } from "./chat-state";
import { chatPolicy } from "./chat-policy";
import { completed, event, row, snapshot, settle, TestGateway } from "./chat-test-fixtures";

describe("kausale Useridentität und Eventsession", () => {
  let gateway: TestGateway;
  let runtime: ChatRuntime;
  const options = { ownerId: "owner", sessionId: "a", onSelectSession: () => {} };
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); runtime = new ChatRuntime(gateway.createClient());
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  async function acquire() { runtime.acquire(options); await settle(); return runtime.actionsFor("owner"); }
  function holdSubmit() {
    const pending: HermesV2ClientMessage[] = [];
    gateway.handle = (frame) => {
      if (frame.op === "message.submit") { pending.push(frame); return true; }
      return frame.op === "session.subscribe";
    };
    return pending;
  }
  const userRows = () => runtime.store.get("a").messages.filter((message) => message.role === "user");
  function foreignCompletion(userRowId = 41, assistantRowId = 42) {
    gateway.socket.event(event("message.started", 1, { turnId: "classic" }));
    gateway.socket.event(event("message.completed", 2, completed("classic", "Classic-Antwort", { userRowId, assistantRowId, complete: true })));
  }

  it.each(["queued", "streaming"] as const)("erhält nach fremdem Completion die eigene Operations-ID bis %s-Receipt", async (status) => {
    gateway.snapshots.set("a", snapshot("a", { messages: [row(41, "gleich", { role: "user", logicalId: "a".repeat(32) })] }));
    const actions = await acquire(); const pending = holdSubmit();
    actions.setDraft("gleich"); const sending = actions.submit(undefined, status === "queued" ? "queue" : "normal"); await settle();
    const operationRow = userRows().find((message) => message.rowId === null)!;
    expect(operationRow.id).toMatch(/^live:user:/);
    foreignCompletion();
    expect(userRows().find((message) => message.id === operationRow.id)?.rowId).toBeNull();
    expect(userRows().find((message) => message.rowId === 41)?.logicalId).toBe("a".repeat(32));
    gateway.socket.result(pending[0]!, { status, userRowId: status === "streaming" ? 43 : null }); await sending;
    expect(userRows().map((message) => message.rowId)).toEqual(status === "queued" ? [41] : [41, 43]);
    expect(userRows().find((message) => message.rowId === 41)?.logicalId).toBe("a".repeat(32));
    expect(runtime.store.get("a").messages.find((message) => message.rowId === 42)?.text).toBe("Classic-Antwort");
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("verbindet Completion vor eigenem Receipt erst durch Rowbeleg und erhält die vorher geladene UID", async () => {
    const actions = await acquire(); const pending = holdSubmit();
    actions.setDraft("eigene Frage"); const sending = actions.submit(); await settle();
    gateway.socket.event(event("message.started", 1, { turnId: "own" }));
    gateway.socket.event(event("message.completed", 2, completed("own", "Antwort", { userRowId: 42, assistantRowId: 43, complete: true })));
    expect(userRows()[0]?.rowId).toBeNull();
    gateway.pages.set("a:0", [row(42, "eigene Frage", { role: "user", logicalId: "b".repeat(32) })]);
    await actions.loadOlder(); expect(userRows()).toHaveLength(2);
    gateway.socket.result(pending[0]!, { status: "streaming", userRowId: 42 }); await sending;
    expect(userRows()).toHaveLength(1);
    expect(userRows()[0]).toMatchObject({ rowId: 42, logicalId: "b".repeat(32) });
    expect(runtime.store.get("a").messages.find((message) => message.rowId === 43)?.text).toBe("Antwort");
  });
  it("retaggt auch nach Completion plus Snapshot keinen fremden User mit spätem eigenem Receipt", async () => {
    const actions = await acquire(); const pending = holdSubmit();
    actions.setDraft("eigener Pendingtext"); const sending = actions.submit(); await settle(); foreignCompletion();
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { cursor: 2, messages: [
      row(41, "echte Classicfrage", { role: "user", logicalId: "a".repeat(32) }), row(42, "Classic-Antwort"),
    ] }) });
    gateway.socket.result(pending[0]!, { status: "streaming", userRowId: 43 }); await sending;
    expect(userRows()).toHaveLength(1);
    expect(userRows()[0]).toMatchObject({ rowId: 41, text: "echte Classicfrage", logicalId: "a".repeat(32) });
  });
  it("bewahrt unknown trotz fremdem Completion und bestätigt dadurch keinen eigenen User", async () => {
    gateway.snapshots.set("a", snapshot("a", { messages: [row(41, "Classicfrage", { role: "user" })] }));
    const actions = await acquire(); holdSubmit(); actions.setDraft("möglicherweise angenommen");
    const sending = actions.submit(); await settle();
    await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs); await sending;
    foreignCompletion();
    expect(runtime.owners.getView("owner").unknownSend).toMatchObject({ operation: "message.submit", resynced: false });
    expect(userRows().find((message) => message.text === "möglicherweise angenommen")?.rowId).toBeNull();
    expect(userRows().find((message) => message.rowId === 41)?.text).toBe("Classicfrage");
    await actions.submit(); expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("bindet einen unbekannten Pendinguser auch nicht an den übernächsten Turn", () => {
    let state = optimisticUser(applyChatSnapshot(emptyChatSession("a"), snapshot()), "pending", "unbekannt");
    for (let turn = 1; turn <= 2; turn++) {
      state = applyChatEvent(state, event("message.started", turn * 2 - 1, { turnId: `classic${turn}` }));
      state = applyChatEvent(state, event("message.completed", turn * 2, completed(`classic${turn}`, `Antwort${turn}`,
        { userRowId: turn * 2 + 39, assistantRowId: turn * 2 + 40, complete: true })));
    }
    state = applyChatHistory(state, [row(41, "echte erste", { role: "user" }), row(43, "echte zweite", { role: "user" })], 0, 2, false);
    expect(state.messages.find((message) => message.id === "live:user:pending")).toMatchObject({ rowId: null, text: "unbekannt" });
    expect(state.messages.filter((message) => message.role === "user").map((message) => message.rowId)).toEqual([41, 43, null]);
  });

  it("weist verschachtelte fremde session.updated-ID vor Metadaten-/Auswahlprojektion für zwei Owner ab", async () => {
    gateway.snapshots.set("a", snapshot("a", { messages: [row(1, "A-Inhalt")], selection: { provider: "p", model: "A" } }));
    gateway.snapshots.set("b", snapshot("b", { messages: [row(2, "B-Inhalt")] }));
    const actions = await acquire(); runtime.acquire({ ...options, ownerId: "ownerB", sessionId: "b" }); await settle();
    const before = runtime.store.get("a"); const beforeB = runtime.store.get("b");
    const forged = snapshot("b").session; forged.title = "Fremde Metadaten";
    gateway.socket.event(event("session.updated", 1, { session: forged, selection: { provider: "p", model: "FOREIGN" }, turnStartedAt: 99 }));
    expect(runtime.client.getSnapshot()).toMatchObject({ state: "incompatible", error: { code: "PROTOCOL_MISMATCH" } });
    expect(runtime.store.get("a")).toMatchObject({ session: { id: "a", title: "a" }, selection: before.selection,
      cursor: before.cursor, selectionRevision: before.selectionRevision, writable: false });
    expect(runtime.store.get("b")).toMatchObject({ session: beforeB.session, messages: beforeB.messages, selectionRevision: beforeB.selectionRevision, writable: false });
    expect(runtime.store.getList().items.some((session) => session.title === "Fremde Metadaten")).toBe(false);
    actions.setDraft("nicht senden"); await actions.submit();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
    expect(gateway.sockets).toHaveLength(1);
  });
  it("prüft verschachtelte Event-ID bereits während ausstehendem Subscribe vor dem Puffer", async () => {
    gateway.handle = (frame) => frame.op === "session.subscribe";
    await acquire();
    gateway.socket.event(event("session.updated", 1, { session: snapshot("b").session, selection: null, turnStartedAt: null }));
    expect(runtime.client.getSnapshot().state).toBe("incompatible");
    expect(runtime.store.get("a")).toMatchObject({ session: null, cursor: 0, selectionRevision: 0, loading: false, writable: false });
  });
  it("bewahrt bereits gesendete Mutation beim Event-Protokollschluss unknown und ignoriert spätes Echo", async () => {
    const actions = await acquire(); const pending = holdSubmit(); actions.setDraft("bereits gesendet");
    const sending = actions.submit(); await settle(); const socket = gateway.socket;
    socket.event(event("session.updated", 1, { session: snapshot("b").session, selection: null, turnStartedAt: null }));
    await sending;
    socket.result(pending[0]!, { status: "streaming", userRowId: 43 });
    expect(runtime.owners.getView("owner").unknownSend).toMatchObject({ operation: "message.submit", canResend: true });
    expect(userRows()[0]?.rowId).toBeNull();
    expect(runtime.client.getSnapshot().state).toBe("incompatible");
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("übernimmt gültiges A-Event, ignoriert alte Metadaten und entwertete Socketframes", async () => {
    await acquire(); const updated = snapshot().session; updated.title = "neu";
    gateway.socket.event(event("session.updated", 2, { session: updated, selection: { provider: "p", model: "new" }, turnStartedAt: null }));
    const before = runtime.store.get("a");
    gateway.socket.event(event("session.updated", 1, { session: snapshot().session, selection: null, turnStartedAt: null }));
    expect(runtime.store.get("a").selectionRevision).toBe(before.selectionRevision);
    expect(runtime.store.getList().items.find((session) => session.id === "a")?.title).toBe("neu");
    const old = gateway.socket; runtime.client.reconnect(); await settle();
    old.event(event("session.updated", 3, { session: snapshot("b").session, selection: null, turnStartedAt: null }));
    expect(runtime.client.getSnapshot().state).toBe("online");
    expect(runtime.store.get("a").session?.id).toBe("a");
  });
});
