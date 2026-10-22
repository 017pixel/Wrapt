// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, settle } from "./chat-test-fixtures";
import { composerSnapshot } from "./chat-composer-test-fixtures";

describe("Textsubmit benötigt bereits beim Klick und unmittelbar vor Send volle Bereitschaft", () => {
  let runtime: ChatRuntime, gateway: TestGateway;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const actions = () => runtime.actionsFor("one");
  const sends = () => gateway.sent.filter((frame) => frame.op === "message.submit");
  const push = (writable: boolean) => gateway.socket.receive({ v: 1, type: "snapshot", snapshot: composerSnapshot("a", { writable }) });
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway();
    gateway.snapshots.set("a", composerSnapshot()); runtime = new ChatRuntime(gateway.createClient()); runtime.acquire(owner); await settle(); actions().setDraft("Mein Text");
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it.each(["readonly", "resync", "hidden", "parked", "offline", "document"] as const)("initial %s hinterlässt keinen wartenden Send, ein neuer bewusster Klick funktioniert", async (kind) => {
    let held!: HermesV2ClientMessage, resync: Promise<void> | undefined;
    if (kind === "readonly") push(false);
    if (kind === "resync") {
      gateway.handle = (frame) => { if (frame.op !== "session.subscribe") return false; held = frame; return true; };
      resync = actions().resync(); await settle();
    }
    if (kind === "hidden") runtime.update({ ...owner, visible: false });
    if (kind === "parked") runtime.update({ ...owner, active: false });
    if (kind === "offline") gateway.socket.drop();
    if (kind === "document") vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const version = runtime.owners.capture("one").draftVersion;
    const blocked = actions().submit();
    expect(runtime.owners.getView("one").submitting).toBe(false);
    if (kind === "readonly") push(true);
    if (kind === "resync") { gateway.handle = null; gateway.socket.result(held, { snapshot: composerSnapshot() }); await resync; }
    if (kind === "hidden" || kind === "parked") runtime.update(owner);
    if (kind === "offline") { await vi.advanceTimersByTimeAsync(1000); await settle(); }
    if (kind === "document") vi.restoreAllMocks();
    await blocked; expect(sends()).toHaveLength(0);
    expect(runtime.owners.getView("one").draft).toBe("Mein Text"); expect(runtime.owners.capture("one").draftVersion).toBe(version);
    expect(runtime.store.get("a").messages).toHaveLength(0);
    await actions().submit(); expect(sends()).toHaveLength(1);
  });
  it.each(["hidden", "parked", "document", "readonly", "resync"] as const)("letzter Guard erkennt %s auch nach Vorbereitung", async (kind) => {
    const pending = actions().submit(); await Promise.resolve(); await Promise.resolve();
    let resync: Promise<void> | undefined, held!: HermesV2ClientMessage;
    if (kind === "hidden") runtime.update({ ...owner, visible: false });
    if (kind === "parked") runtime.update({ ...owner, active: false });
    if (kind === "document") vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    if (kind === "readonly") push(false);
    if (kind === "resync") {
      gateway.handle = (frame) => { if (frame.op !== "session.subscribe") return false; held = frame; return true; };
      resync = actions().resync(); await settle();
    }
    await pending; expect(sends()).toHaveLength(0); expect(runtime.owners.getView("one").draft).toBe("Mein Text");
    if (resync) { gateway.handle = null; gateway.socket.result(held, { snapshot: composerSnapshot() }); await resync; }
  });
  it("Stop behält seinen reservierten Schreibweg auch bei readonly", async () => {
    push(false); await actions().submit(); await actions().stop();
    expect(sends()).toHaveLength(0); expect(gateway.sent.filter((frame) => frame.op === "session.stop")).toHaveLength(1);
  });
});
