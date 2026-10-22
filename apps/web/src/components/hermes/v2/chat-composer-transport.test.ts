// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, event, row, settle } from "./chat-test-fixtures";
import { composerCatalog, composerSnapshot, selection, TestUploads } from "./chat-composer-test-fixtures";

describe("Composertransport und autoritative Antwortgrenzen", () => {
  let runtime: ChatRuntime, gateway: TestGateway, uploads: TestUploads;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const actions = () => runtime.actionsFor("one");
  const view = () => runtime.owners.getView("one");
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); gateway.composer = true;
    gateway.snapshots.set("a", composerSnapshot()); gateway.catalogs.set("a", composerCatalog()); uploads = new TestUploads();
    runtime = new ChatRuntime(gateway.createClient(), uploads.client()); runtime.acquire(owner); await settle(); await actions().readCatalog();
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("komponiert Composer, Work und Ressourcen und behält einen Socket", async () => {
    runtime.client.enableReadEvidence(); runtime.client.activateReadEvidence(); await settle();
    expect(new URL(gateway.socket.url).searchParams.toString()).toBe("readEvidence=1&composer=1&work=1&resources=1");
    expect(gateway.sockets.filter((socket) => socket.readyState === 1)).toHaveLength(1);
    expect(runtime.client.getComposerBinding()?.id).toBe(gateway.socket.connectionId);
  });
  it("Connection-ID ist ausschließlich tatsächlicher Serverwert und wird bei Close sofort ungültig", () => {
    const before = runtime.client.getComposerBinding(); expect(before?.id).toBe(gateway.socket.connectionId);
    gateway.socket.drop(); expect(runtime.client.getComposerBinding()).toBeNull();
  });
  it("gleiches Socket mit neuer tatsächlicher Connection-ID entwertet gesendete Mutation ohne Replay", async () => {
    gateway.handle = (frame) => frame.op === "session.title";
    const pending = actions().setTitle("Alt"); await settle();
    const next = crypto.randomUUID(); gateway.socket.receive({ v: 1, type: "connection", state: "online", epoch: "epoch", connectionId: next });
    await pending; await settle(); expect(runtime.client.getComposerBinding()?.id).toBe(next);
    expect(gateway.sent.filter((frame) => frame.op === "session.title")).toHaveLength(1);
    expect(runtime.store.get("a").session?.title).toBe("a");
  });
  it.each(["session.title", "reasoning.select", "model.select"] as const)("unklare %s Antwort bleibt explizit unknown und wird nie automatisch wiederholt", async (op) => {
    gateway.handle = (frame) => frame.op === op;
    const pending = op === "session.title" ? actions().setTitle("Alt") : op === "reasoning.select" ? actions().selectReasoning("high") : actions().selectModel({ provider: "test", model: "b" });
    await settle(); await vi.advanceTimersByTimeAsync(25_000); await pending;
    const composer = view().composer;
    expect(op === "session.title" ? composer.title.status : op === "reasoning.select" ? composer.reasoning.status : composer.model.status).toBe("unknown");
    expect(view().actionError?.outcome).toBe("unknown"); expect(gateway.sent.filter((frame) => frame.op === op)).toHaveLength(1);
  });
  it("neuere session.updated-Titelwahl gewinnt gegen verspäteten eigenen Receipt", async () => {
    let finish!: () => void;
    gateway.handle = (frame, socket) => { if (frame.op !== "session.title") return false; finish = () => socket.result(frame, { title: frame.title, pending: false }); return true; };
    const pending = actions().setTitle("Alt"); await settle();
    const newer = { ...composerSnapshot().session, title: "Neuer Coretitel" };
    gateway.socket.event(event("session.updated", 1, { session: newer, selection, turnStartedAt: null })); finish(); await pending;
    expect(runtime.store.get("a").session?.title).toBe("Neuer Coretitel"); expect(view().composer.title.status).toBe("unconfirmed");
  });
  it("positive Userrow vor Receipt wird exakt angereichert ohne neue geraten gleiche Row", async () => {
    await actions().uploadAttachment(new File(["a"], "a.txt")); const metadata = view().composer.attachments[0]!.attachment!;
    let finish!: () => void;
    gateway.handle = (frame, socket) => { if (frame.op !== "message.submit") return false; finish = () => socket.result(frame, { status: "streaming", userRowId: 42 }); return true; };
    actions().setDraft("gleich"); const pending = actions().submit(); await settle();
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: composerSnapshot("a", { messages: [row(42, "gleich", { role: "user" }), row(43, "gleich", { role: "user" })] }) });
    finish(); await pending; const rows = runtime.store.get("a").messages;
    expect(rows).toHaveLength(2); expect(rows.find((message) => message.rowId === 42)?.attachments).toEqual([metadata]);
    expect(rows.find((message) => message.rowId === 43)?.attachments).toBeUndefined();
  });
  it("Tokenereignisse veröffentlichen weder Composerowner noch Katalog neu", () => {
    const notify = vi.fn(), list = vi.fn(); const off = runtime.owners.subscribe("one", notify), offList = runtime.store.subscribeList(list);
    gateway.socket.event(event("message.delta", 1, { turnId: "t", text: "a" }));
    gateway.socket.event(event("reasoning.delta", 2, { turnId: "t", text: "b" }));
    expect(notify).not.toHaveBeenCalled(); expect(list).not.toHaveBeenCalled(); off(); offList();
  });
});
