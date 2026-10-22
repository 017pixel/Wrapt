// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { chatPolicy } from "./chat-policy";
import { newComposerDraft } from "./chat-composer-state";
import { completed, event, inflight, row, settle, snapshot, TestGateway, type TestSocket } from "./chat-test-fixtures";

describe("Owner, Leases und sendebewusste Runtime", () => {
  const runtimes: ChatRuntime[] = [];
  function setup() {
    const gateway = new TestGateway();
    const runtime = new ChatRuntime(gateway.createClient());
    runtimes.push(runtime);
    return { gateway, runtime };
  }
  const options = (ownerId = "owner", sessionId: string | null = "a") => ({ ownerId, sessionId, onSelectSession: vi.fn(), active: true });
  beforeEach(() => { vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); });
  afterEach(() => {
    for (const runtime of runtimes.splice(0)) runtime.dispose("v2-disabled");
    useAppPreferences.setState({ hermesV2Enabled: false });
    vi.useRealTimers();
  });
  it("hält 20 aktive Session-Leases an einem Socket und Sidebar von Tokens getrennt", async () => {
    const { gateway, runtime } = setup();
    for (let index = 0; index < 20; index++) runtime.acquire(options(`owner${index}`, `s${index}`));
    await settle();
    expect(gateway.sockets).toHaveLength(1);
    expect(gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(20);
    const list = vi.fn(); const other = vi.fn(); const selected = vi.fn();
    runtime.store.subscribeList(list); runtime.store.subscribe("s1", other); runtime.store.subscribe("s0", selected);
    gateway.socket.event(event("message.delta", 1, { turnId: "t", text: "Token" }, "s0"));
    expect(selected).toHaveBeenCalledOnce();
    expect(list).not.toHaveBeenCalled(); expect(other).not.toHaveBeenCalled();
  });
  it("behält StrictMode-Replay und zwei Owner derselben Session ohne doppeltes Abo", async () => {
    const { gateway, runtime } = setup();
    const first = options("one");
    const release = runtime.acquire(first);
    release();
    const releaseReplay = runtime.acquire(first);
    const releaseTwo = runtime.acquire(options("two"));
    await settle();
    expect(gateway.sockets).toHaveLength(1);
    expect(gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(1);
    releaseReplay(); await settle();
    expect(gateway.sent.filter((frame) => frame.op === "session.unsubscribe")).toHaveLength(0);
    releaseTwo(); await settle();
    expect(gateway.socket.readyState).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("trennt A/B-Drafts und ignoriert fremde Query-Auswahl während Parken", async () => {
    const { runtime } = setup();
    runtime.acquire(options("one", "a")); runtime.acquire(options("two", "b")); await settle();
    const one = runtime.actionsFor("one"); const two = runtime.actionsFor("two");
    one.setDraft("Entwurf A"); two.setDraft("Entwurf B");
    runtime.update({ ...options("one", "b"), active: false });
    expect(runtime.owners.getView("one")).toMatchObject({ sessionId: "a", draft: "Entwurf A" });
    one.selectSession("b"); one.setDraft("eigener B"); one.selectSession("a");
    expect(runtime.owners.getView("one").draft).toBe("Entwurf A");
    expect(runtime.owners.getView("two").draft).toBe("Entwurf B");
  });
  it("löscht bei Flag-off sofort Lifecycle und sendet während 60 Sekunden nichts nach", async () => {
    const { gateway, runtime } = setup();
    runtime.acquire(options()); await settle();
    gateway.handle = (frame) => frame.op === "message.submit";
    runtime.actionsFor("owner").setDraft("nicht wiederholen");
    const pending = runtime.actionsFor("owner").submit(); await settle();
    const count = gateway.sent.length;
    useAppPreferences.setState({ hermesV2Enabled: false });
    await pending; await vi.advanceTimersByTimeAsync(60_000);
    expect(gateway.sent).toHaveLength(count);
    expect(gateway.sent.some((frame) => frame.op === "session.stop")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(runtime.owners.records.size).toBe(0);
    useAppPreferences.setState({ hermesV2Enabled: true });
    gateway.handle = null;
    gateway.snapshots.set("a", snapshot("a", { inflight, running: true }));
    runtime.acquire(options()); await settle();
    expect(runtime.store.get("a").running).toBe(true);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("lässt alte Owner-Cleanup-Microtasks einen frisch aktivierten Owner nicht entfernen", async () => {
    const { runtime } = setup();
    const release = runtime.acquire(options());
    useAppPreferences.setState({ hermesV2Enabled: false });
    release();
    useAppPreferences.setState({ hermesV2Enabled: true });
    runtime.acquire(options()); await settle();
    expect(runtime.owners.capture("owner").owner.mounted).toBe(true);
    expect(runtime.sessionIsLeased("a")).toBe(true);
  });
  it("schreibt nach Auswahlwechsel während wartendem Subscribe keinen Prompt", async () => {
    const { gateway, runtime } = setup();
    let subscribe: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "session.subscribe" && frame.sessionId === "a") { subscribe = frame; return true; } return false; };
    runtime.acquire(options()); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("A");
    const pending = actions.submit();
    actions.selectSession("b");
    gateway.socket.result(subscribe!, { snapshot: snapshot("a") });
    await pending; await settle();
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
    expect(runtime.owners.getView("owner").sessionId).toBe("b");
  });
  it("lässt spätes Submit-Ergebnis einen neuen Draft derselben Session stehen", async () => {
    const { gateway, runtime } = setup();
    let sent: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "message.submit") { sent = frame; return true; } return false; };
    runtime.acquire(options()); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("alt");
    const pending = actions.submit(); await settle();
    actions.setDraft("neu");
    gateway.socket.result(sent!, { status: "streaming", userRowId: null });
    await pending;
    expect(runtime.owners.getView("owner").draft).toBe("neu");
  });
  it("leert bei spätem Resultat weder B noch nach Rückwechsel den eingefrorenen A-Draft", async () => {
    const { gateway, runtime } = setup();
    let sent: HermesV2ClientMessage | undefined;
    gateway.handle = (frame) => { if (frame.op === "message.submit") { sent = frame; return true; } return false; };
    runtime.acquire(options()); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("A");
    const pending = actions.submit(); await settle();
    actions.selectSession("b"); actions.setDraft("B"); actions.selectSession("a");
    gateway.socket.result(sent!, { status: "streaming", userRowId: null });
    await pending;
    expect(runtime.owners.getView("owner").draft).toBe("A");
    actions.selectSession("b"); expect(runtime.owners.getView("owner").draft).toBe("B");
  });
  it("verhindert synchrone Doppelsends und leert nur den unveränderten Draft", async () => {
    const { gateway, runtime } = setup(); runtime.acquire(options()); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("einmal");
    await Promise.all([actions.submit(), actions.submit()]);
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
    expect(runtime.owners.getView("owner").draft).toBe("");
  });
  it("selektiert nach geschlossenem Create kein Panel und sendet keinen ersten Prompt", async () => {
    const { gateway, runtime } = setup();
    let create: HermesV2ClientMessage | undefined; let socket: TestSocket | undefined;
    gateway.handle = (frame, current) => { if (frame.op === "session.create") { create = frame; socket = current; return true; } return false; };
    const owner = options("dialog", null); const release = runtime.acquire(owner);
    runtime.acquire(options("other", "b")); await settle();
    const pending = runtime.actionsFor("dialog").createSession({ projectId: null }); await settle();
    release(); await settle();
    socket!.result(create!, { snapshot: snapshot("created") }); await pending; await settle();
    expect(owner.onSelectSession).not.toHaveBeenCalled();
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(0);
  });
  it.each(["normal", "queue"] as const)("bewahrt unknown für verlorenen %s-Send trotz leerer History bis zur ausdrücklichen Entscheidung", async (mode) => {
    const { gateway, runtime } = setup();
    gateway.handle = (frame) => frame.op === "message.submit";
    runtime.acquire(options()); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("möglicherweise gesendet");
    const pending = actions.submit(undefined, mode); await settle();
    await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs); await pending;
    expect(runtime.owners.getView("owner").unknownSend).toMatchObject({ resynced: false, canResend: true });
    await actions.submit();
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
    gateway.snapshots.set("a", snapshot("a", { running: true, inflight, queuedText: mode === "queue" ? "möglicherweise gesendet" : null }));
    await actions.resync();
    expect(runtime.owners.getView("owner").unknownSend).toMatchObject({ resynced: true });
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
    await actions.continueWithoutResend();
    expect(runtime.owners.getView("owner")).toMatchObject({ draft: "", unknownSend: null });
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
  });
  it("erhält den geänderten Draft beim lokalen Fortfahren und erlaubt bewussten Resend erst nach Abgleich", async () => {
    const { gateway, runtime } = setup();
    gateway.handle = (frame) => frame.op === "message.submit";
    runtime.acquire(options()); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("alt");
    const pending = actions.submit(); await settle();
    await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs); await pending;
    await actions.resendUnknown({ acknowledgeDuplicateRisk: true });
    expect(gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
    actions.setDraft("neuer Entwurf");
    await actions.continueWithoutResend();
    expect(runtime.owners.getView("owner").draft).toBe("neuer Entwurf");
    expect(runtime.owners.getView("owner").unknownSend).toBeNull();
  });
  it("stellt nach Completion gespeicherte User-/Assistantrows wieder her und behält ältere History", async () => {
    const { gateway, runtime } = setup();
    gateway.snapshots.set("a", snapshot("a", { messages: [row(1, "älter")] }));
    runtime.acquire(options()); await settle();
    const actions = runtime.actionsFor("owner"); actions.setDraft("Frage"); await actions.submit();
    gateway.snapshots.set("a", snapshot("a", { messages: [row(2, "Frage", { role: "user" }), row(3, "Antwort")] }));
    gateway.socket.event(event("message.completed", 1, completed("turn", "Antwort", { userRowId: 2, assistantRowId: 3, complete: true })));
    await settle();
    expect(runtime.store.get("a").messages.map((message) => message.rowId)).toEqual([1, 2, 3]);
  });
  it("verliert an der Draftgrenze keine Eingaben und zeigt den Wechselkonflikt ohne Throw", async () => {
    const { runtime } = setup(); runtime.acquire(options()); await settle();
    const owner = runtime.owners.capture("owner").owner;
    const actions = runtime.actionsFor("owner"); actions.setDraft("behalten");
    for (let index = 0; index < chatPolicy.maxOwnerDrafts - 1; index++) owner.drafts.set(`draft${index}`, {
      text: `${index}`, version: 1, submitting: false, error: null, unknown: null, composer: newComposerDraft(),
    });
    expect(() => actions.selectSession("overflow")).not.toThrow();
    expect(runtime.owners.getView("owner")).toMatchObject({ sessionId: "a", draft: "behalten", actionError: { code: "DRAFT_LIMIT" } });
  });
});
