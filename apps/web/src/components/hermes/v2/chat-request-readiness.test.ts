// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, settle, snapshot } from "./chat-test-fixtures";
import { approval, clarify } from "./chat-request-test-fixtures";
import { chatPolicy } from "./chat-policy";

describe("Initiale Handlungsbereitschaft der Anfrageaktionen", () => {
  let runtime: ChatRuntime, gateway: TestGateway;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const writes = () => gateway.sent.filter((frame) => frame.op === "request.respond" || frame.op === "request.lock");
  const request = (lock: boolean) => lock ? clarify() : approval();
  const run = (lock: boolean) => lock ? runtime.actionsFor("one").lockRequest(clarify(), "q1", null)
    : runtime.actionsFor("one").respond(approval(), { kind: "approval", choice: "once" });
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); runtime = new ChatRuntime(gateway.createClient());
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  const open = async (lock: boolean, writable = true) => {
    gateway.snapshots.set("a", snapshot("a", { requests: [request(lock)], writable })); runtime.acquire(owner); await settle();
  };
  const observe = () => {
    const observed: { pending: number; code: string | null }[] = [];
    const stop = runtime.owners.subscribe("one", () => {
      const view = runtime.owners.getView("one"); observed.push({ pending: view.requestStates.length, code: view.actionError?.code ?? null });
    });
    return { observed, stop };
  };

  for (const lock of [false, true]) {
    it(`verwirft readonly vor Eintrag/Fehlerlöschung, späterer Writable-Beleg verlangt neuen Klick, Lock=${lock}`, async () => {
      await open(lock, false);
      runtime.owners.capture("one").draft.error = { code: "PREVIOUS", message: "Vorheriger Fehler", outcome: "not_sent" };
      runtime.owners.emit(runtime.owners.records.get("one")!);
      const { observed, stop } = observe();
      const pending = run(lock);
      expect(observed).toEqual([{ pending: 0, code: "SESSION_UNAVAILABLE" }]);
      const before = gateway.sent.length;
      gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { requests: [request(lock)] }) });
      await pending; expect(writes()).toEqual([]);
      expect(gateway.sent.slice(before).some((frame) => frame.op === "session.subscribe")).toBe(false);
      await run(lock); expect(writes()).toHaveLength(1); stop();
    });

    it(`verwirft bereits laufenden Resync sofort und bestätigt erst den neuen Klick, Lock=${lock}`, async () => {
      await open(lock); let release!: () => void;
      gateway.handle = (frame, socket) => {
        if (frame.op !== "session.subscribe") return false;
        release = () => socket.result(frame, { snapshot: gateway.snapshots.get("a") }); return true;
      };
      const syncing = runtime.ensureSubscribed("a", true); await settle(); const { observed, stop } = observe();
      const pending = run(lock); expect(observed).toEqual([{ pending: 0, code: "SESSION_UNAVAILABLE" }]);
      gateway.handle = null; release(); await syncing; await pending;
      expect(writes()).toEqual([]); await run(lock); expect(writes()).toHaveLength(1); stop();
    });

    it(`offline gestarteter Klick erzeugt vor und nach Reconnect keinen Eintrag oder Nachsend, Lock=${lock}`, async () => {
      await open(lock); gateway.socket.drop(); const { observed, stop } = observe();
      const pending = run(lock); expect(observed).toEqual([{ pending: 0, code: "SESSION_UNAVAILABLE" }]);
      await vi.advanceTimersByTimeAsync(chatPolicy.retryInitialMs); await settle(); await pending;
      expect(writes()).toEqual([]); await run(lock); expect(writes()).toHaveLength(1); stop();
    });

    it(`ein erst nach gültigem Start begonnener Resync verhindert weiterhin den Send, Lock=${lock}`, async () => {
      await open(lock); let release!: () => void;
      gateway.handle = (frame, socket) => {
        if (frame.op !== "session.subscribe") return false;
        release = () => socket.result(frame, { snapshot: gateway.snapshots.get("a") }); return true;
      };
      const pending = run(lock); expect(runtime.owners.getView("one").requestStates[0]?.status).toBe("pending");
      const syncing = runtime.ensureSubscribed("a", true); await pending;
      expect(writes()).toEqual([]); expect(runtime.owners.getView("one").requestStates).toEqual([]);
      gateway.handle = null; release(); await syncing; await run(lock); expect(writes()).toHaveLength(1);
    });
  }
});
