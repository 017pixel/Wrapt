// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { event, row, settle, snapshot, TestGateway } from "./chat-test-fixtures";

describe("Phase-3-Vertragskorrekturen", () => {
  let gateway: TestGateway;
  let runtime: ChatRuntime;
  const options = { ownerId: "owner", sessionId: "a", onSelectSession: vi.fn() };
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); runtime = new ChatRuntime(gateway.createClient());
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  async function acquire() { runtime.acquire(options); await settle(); return runtime.actionsFor("owner"); }
  const users = () => runtime.store.get("a").messages.filter((message) => message.role === "user");

  it("bindet Submit-Rowreceipt vor dem History-Read ohne doppelte Userrow", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "message.submit") return false;
      queueMicrotask(() => socket.result(frame, { status: "streaming", userRowId: 42 })); return true;
    };
    const actions = await acquire(); actions.setDraft("ein angenommener Prompt"); await actions.submit();
    expect(users()).toHaveLength(1); expect(users()[0]?.rowId).toBe(42);
    expect(runtime.store.get("a").turn).toBeNull();
    gateway.pages.set("a:0", [row(42, "ein angenommener Prompt", { role: "user" })]);
    await actions.loadOlder();
    expect(users()).toHaveLength(1); expect(users()[0]?.rowId).toBe(42);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("verbindet erst nachgeliefertes Receipt mit bereits geladener History und erhält deren UID", async () => {
    let pending: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "message.submit") { pending = frame; return true; } return false; };
    const actions = await acquire(); actions.setDraft("Prompt"); const submit = actions.submit(); await settle();
    gateway.pages.set("a:0", [row(42, "Prompt", { role: "user", logicalId: "a".repeat(32) })]);
    await actions.loadOlder(); expect(users()).toHaveLength(2);
    gateway.socket.result(pending!, { status: "streaming", userRowId: 42 }); await submit;
    expect(users()).toHaveLength(1);
    expect(users()[0]).toMatchObject({ rowId: 42, logicalId: "a".repeat(32) });
    expect(runtime.store.get("a").turn).toBeNull();
  });
  it("verschmilzt bei gleichem Text ausschließlich die konkret belegte Userrow", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "message.submit") return false;
      queueMicrotask(() => socket.result(frame, { status: "streaming", userRowId: 42 })); return true;
    };
    const actions = await acquire(); actions.setDraft("identisch"); await actions.submit();
    gateway.pages.set("a:0", [row(41, "identisch", { role: "user" }), row(42, "identisch", { role: "user" })]);
    await actions.loadOlder();
    expect(users().map((message) => message.rowId)).toEqual([41, 42]);
  });
  it("wendet Receipt auf A an, ohne neuen Owner-B-Draft oder Auswahl anzutasten", async () => {
    let pending: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "message.submit") { pending = frame; return true; } return false; };
    const actions = await acquire(); runtime.acquire({ ...options, ownerId: "reader" }); await settle();
    actions.setDraft("ursprünglich A"); const submit = actions.submit(); await settle();
    actions.selectSession("b"); actions.setDraft("neuer Draft B");
    gateway.socket.result(pending!, { status: "streaming", userRowId: 42 }); await submit;
    expect(users()).toHaveLength(1); expect(users()[0]?.rowId).toBe(42);
    expect(runtime.owners.getView("owner")).toMatchObject({ sessionId: "b", draft: "neuer Draft B" });
  });
  it("retaggt nach Snapshot-Barriere keine neue Userrow mit einem alten Submit-Receipt", async () => {
    let pending: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "message.submit") { pending = frame; return true; } return false; };
    const actions = await acquire(); actions.setDraft("alt"); const submit = actions.submit(); await settle();
    actions.setDraft("inzwischen geändert");
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { messages: [row(99, "neuer echter Turn", { role: "user" })] }) });
    gateway.socket.result(pending!, { status: "streaming", userRowId: 42 }); await submit;
    expect(users().map((message) => message.rowId)).toEqual([99]);
    expect(runtime.owners.getView("owner").draft).toBe("inzwischen geändert");
  });
  it("entfernt bei queued nur die konkrete optimistische Userrow und erfindet aus dem Receipt keinen Queuekopf", async () => {
    gateway.snapshots.set("a", snapshot("a", { messages: [row(41, "gleichlautend", { role: "user" })] }));
    const actions = await acquire();
    gateway.handle = (frame, socket) => {
      if (frame.op === "session.subscribe") return true;
      if (frame.op !== "message.submit") return false;
      queueMicrotask(() => socket.result(frame, { status: "queued", userRowId: null })); return true;
    };
    actions.setDraft("gleichlautend"); await actions.submit();
    expect(users().map((message) => message.rowId)).toEqual([41]);
    expect(runtime.store.get("a").queuedText).toBeNull();
    expect(runtime.store.get("a").turn).toBeNull();
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });

  it("lässt ein spätes model.select keine neuere Snapshotwahl überschreiben", async () => {
    let pending: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "model.select") { pending = frame; return true; } return false; };
    const actions = await acquire(); const selected = actions.selectModel({ provider: "p", model: "old" }); await settle();
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { selection: { provider: "p", model: "new" } }) });
    gateway.socket.result(pending!, { selection: { provider: "p", model: "old" }, deferred: false, confirmation: null }); await selected; await settle();
    expect(runtime.store.get("a").selection?.model).toBe("new");
    expect(gateway.sent.filter((frame) => frame.op === "model.select")).toHaveLength(1);
    expect(gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(1);
  });
  it("beachtet auch eine spätere autoritative session.updated-Auswahl derselben Generation", async () => {
    let pending: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "model.select") { pending = frame; return true; } return false; };
    const actions = await acquire(); const selected = actions.selectModel({ provider: "p", model: "old" }); await settle();
    gateway.socket.event(event("session.updated", 1, { session: snapshot().session, selection: { provider: "p", model: "event-new" }, turnStartedAt: null }));
    gateway.socket.result(pending!, { selection: { provider: "p", model: "old" }, deferred: false, confirmation: null }); await selected;
    expect(runtime.store.get("a").selection?.model).toBe("event-new");
  });
  it("entwertet das Modell-Echo auch bei einer erneuten null-Beobachtung statt bloßer Wertänderung", async () => {
    let pending: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "model.select") { pending = frame; return true; } return false; };
    const actions = await acquire(); const selected = actions.selectModel({ provider: "p", model: "old" }); await settle();
    gateway.socket.event(event("session.updated", 1, { session: snapshot().session, selection: null, turnStartedAt: null }));
    gateway.socket.result(pending!, { selection: { provider: "p", model: "old" }, deferred: false, confirmation: null }); await selected;
    expect(runtime.store.get("a").selection).toBeNull();
  });
  it("übernimmt ein gültiges aktuelles Modellresultat weiterhin ohne Mutationsreplay", async () => {
    const actions = await acquire();
    gateway.handle = (frame) => frame.op === "session.subscribe";
    await actions.selectModel({ provider: "p", model: "accepted" });
    expect(runtime.store.get("a").selection).toEqual({ provider: "p", model: "accepted" });
    expect(gateway.sent.filter((frame) => frame.op === "model.select")).toHaveLength(1);
  });

  it("weist fremden Subscribe-Snapshot trotz passender RPC-ID/Op vor Übernahme sichtbar ab", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "session.subscribe") return false;
      queueMicrotask(() => socket.result(frame, { snapshot: snapshot("b", { messages: [row(1, "B-Inhalt")] }) })); return true;
    };
    const actions = await acquire();
    expect(runtime.store.get("a")).toMatchObject({ session: null, messages: [], writable: false, loading: false, error: { code: "PROTOCOL_MISMATCH" } });
    expect(runtime.client.getSnapshot()).toMatchObject({ state: "incompatible", error: { code: "PROTOCOL_MISMATCH" } });
    actions.setDraft("keine Mutation auf falschen Inhalt"); await actions.submit();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
    expect(gateway.sockets).toHaveLength(1);
  });
  it("weist fremde History-sessionId ab und erhält die zuvor belegten A-Inhalte", async () => {
    gateway.snapshots.set("a", snapshot("a", { messages: [row(1, "A-Inhalt")] }));
    const actions = await acquire();
    gateway.handle = (frame, socket) => {
      if (frame.op !== "history.read") return false;
      queueMicrotask(() => socket.result(frame, { sessionId: "b", messages: [row(8, "B-History")], offset: frame.offset ?? 0, returned: 1, hasMore: false })); return true;
    };
    await actions.loadOlder();
    expect(runtime.store.get("a").messages.map((message) => message.text)).toEqual(["A-Inhalt"]);
    expect(runtime.store.get("a")).toMatchObject({ loadingOlder: false, writable: false, error: { code: "PROTOCOL_MISMATCH" } });
    expect(runtime.owners.getView("owner").actionError?.code).toBe("PROTOCOL_MISMATCH");
  });
  it("akzeptiert die zurückprojizierte Stored-ID unabhängig vom Core-Titel", async () => {
    const projected = snapshot("a"); projected.session.title = "core-canonical-name";
    gateway.snapshots.set("a", projected);
    const actions = await acquire(); gateway.pages.set("a:0", [row(42, "A-History", { role: "user" })]);
    await actions.loadOlder();
    expect(runtime.store.get("a")).toMatchObject({ writable: true, error: null, session: { id: "a", title: "core-canonical-name" } });
    expect(runtime.client.getSnapshot().state).toBe("online");
  });
  it("erlaubt die neue serverbestimmte ID bei createSession ohne erwartete Session-ID", async () => {
    const actions = await acquire();
    await expect(actions.createSession({ projectId: null })).resolves.toBe("created");
    expect(runtime.owners.getView("owner").sessionId).toBe("created");
    expect(runtime.client.getSnapshot().state).toBe("online");
  });
});
