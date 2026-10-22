// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, settle } from "./chat-test-fixtures";
import { composerCatalog, composerSnapshot, TestUploads } from "./chat-composer-test-fixtures";

describe("Initiale und letzte Composer-Bereitschaft", () => {
  let runtime: ChatRuntime, gateway: TestGateway, uploads: TestUploads;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const actions = () => runtime.actionsFor("one");
  const operations = ["model.select", "session.title", "reasoning.select", "upload"] as const;
  const invoke = (operation: typeof operations[number]) => operation === "model.select" ? actions().selectModel({ provider: "test", model: "b" })
    : operation === "session.title" ? actions().setTitle("Titel") : operation === "reasoning.select" ? actions().selectReasoning("high")
      : actions().uploadAttachment(new File(["a"], "datei.txt"));
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); gateway.composer = true; gateway.snapshots.set("a", composerSnapshot()); gateway.catalogs.set("a", composerCatalog());
    uploads = new TestUploads(); runtime = new ChatRuntime(gateway.createClient(), uploads.client()); runtime.acquire(owner); await settle(); await actions().readCatalog();
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it.each(operations)("%s beginnt weder readonly noch während Resync und wird später nicht nachgesendet", async (operation) => {
    for (const unavailable of [{ writable: false }, { loading: true }]) {
      runtime.store.update("a", (state) => ({ ...state, ...unavailable }));
      const blocked = invoke(operation);
      runtime.store.update("a", (state) => ({ ...state, writable: true, loading: false }));
      await blocked;
      expect(gateway.sent.filter((frame) => frame.op === operation)).toHaveLength(0); expect(uploads.calls).toHaveLength(0);
      const composer = runtime.owners.getView("one").composer;
      expect(composer.model.status).toBe("idle"); expect(composer.title.status).toBe("idle");
      expect(composer.reasoning.status).toBe("idle"); expect(composer.attachments).toHaveLength(0);
    }
    await invoke(operation);
    expect(operation === "upload" ? uploads.calls.length : gateway.sent.filter((frame) => frame.op === operation).length).toBe(1);
  });
  it.each(operations)("%s hat nach Ownerwechsel vor dem letzten Sendguard keine Wirkung", async (operation) => {
    if (operation === "upload") {
      let changed = false;
      const unsubscribe = runtime.owners.subscribe("one", () => {
        if (changed || !runtime.owners.getView("one").composer.attachments.length) return;
        changed = true; runtime.update({ ...owner, sessionId: "b" });
      });
      await invoke(operation); unsubscribe();
    } else {
      const pending = invoke(operation); runtime.update({ ...owner, sessionId: "b" }); await pending;
    }
    expect(gateway.sent.filter((frame) => frame.op === operation)).toHaveLength(0); expect(uploads.calls).toHaveLength(0);
    runtime.update(owner); await settle(); expect(runtime.owners.getView("one").composer.attachments).toHaveLength(0);
  });
  it.each(operations)("%s wird im geparkten/unsichtbaren Owner sofort abgewiesen", async (operation) => {
    for (const options of [{ active: false, visible: true }, { active: true, visible: false }]) {
      runtime.update({ ...owner, ...options }); await invoke(operation);
      expect(gateway.sent.filter((frame) => frame.op === operation)).toHaveLength(0); expect(uploads.calls).toHaveLength(0);
      runtime.update(owner);
    }
  });
  it.each(operations)("%s hat offline keine wartende Mutation für die spätere Bereitschaft", async (operation) => {
    gateway.socket.drop(); const pending = invoke(operation);
    await vi.advanceTimersByTimeAsync(1000); await settle(); await pending;
    expect(gateway.sent.filter((frame) => frame.op === operation)).toHaveLength(0); expect(uploads.calls).toHaveLength(0);
  });
  it.each(["model.select", "session.title", "reasoning.select"] as const)("%s erkennt Readonlywechsel nach Vorbereitung ohne Send", async (operation) => {
    const pending = invoke(operation);
    runtime.store.update("a", (state) => ({ ...state, writable: false })); await pending;
    expect(gateway.sent.filter((frame) => frame.op === operation)).toHaveLength(0);
  });
  it("keine neue Wirefunktion ohne echte connectionId; bestehende Modellwahl bleibt kompatibel", async () => {
    gateway.composer = false; actions().reconnect(); await settle(); await actions().readCatalog();
    await actions().setTitle("Titel"); await actions().selectReasoning("high"); await actions().uploadAttachment(new File(["a"], "a"));
    expect(gateway.sent.filter((frame) => ["session.title", "reasoning.select"].includes(frame.op))).toHaveLength(0);
    expect(uploads.calls).toHaveLength(0);
    await actions().selectModel({ provider: "test", model: "b" }); expect(gateway.sent.filter((frame) => frame.op === "model.select")).toHaveLength(1);
  });
  it("Flag-off beendet alle neuen Vorbereitungen ohne Folgeverkehr oder Metadaten", async () => {
    const pending = [invoke("model.select"), invoke("session.title"), invoke("reasoning.select")];
    useAppPreferences.setState({ hermesV2Enabled: false }); await Promise.all(pending); await vi.advanceTimersByTimeAsync(60_000);
    expect(gateway.sent.filter((frame) => operations.includes(frame.op as typeof operations[number]))).toHaveLength(0);
    expect(runtime.owners.records.size).toBe(0); expect(runtime.client.getComposerBinding()).toBeNull();
  });
});
