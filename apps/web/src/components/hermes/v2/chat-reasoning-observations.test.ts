// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, event, settle } from "./chat-test-fixtures";
import { composerCatalog, composerSnapshot, selection, settings } from "./chat-composer-test-fixtures";

describe("Reasoningwunsch gegenüber Info-Beobachtung und tatsächlichem Modellwechsel", () => {
  let runtime: ChatRuntime, gateway: TestGateway;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const actions = () => runtime.actionsFor("one");
  const view = () => runtime.owners.getView("one");
  let seq = 0;
  const info = (model = selection, reasoning = { effort: "ultra", wire: "high" }) => gateway.socket.event(event("session.updated", ++seq,
    { session: composerSnapshot().session, selection: model, turnStartedAt: null, composer: { ...settings, reasoning } }));
  beforeEach(async () => {
    vi.useFakeTimers(); seq = 0; useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); gateway.composer = true;
    gateway.snapshots.set("a", composerSnapshot()); gateway.catalogs.set("a", composerCatalog()); runtime = new ChatRuntime(gateway.createClient());
    runtime.acquire(owner); await settle(); await actions().readCatalog();
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  for (const order of ["info-first", "receipt-first"] as const) {
    it.each(["observed", "unconfirmed", "unknown"] as const)(`${order}: %s bleibt samt requested und beobachtetem Wire erhalten`, async (status) => {
      let held!: HermesV2ClientMessage;
      gateway.handle = (frame) => { if (frame.op !== "reasoning.select") return false; held = frame; return true; };
      const pending = actions().selectReasoning("ultra"); await settle();
      const observed = { ...settings, reasoning: status === "unconfirmed" ? { effort: null, wire: null } : { effort: "ultra", wire: "high" } };
      const publish = () => gateway.socket.event(event("session.updated", ++seq,
        { session: composerSnapshot().session, selection, turnStartedAt: null, composer: observed }));
      const receipt = () => status === "unknown" ? gateway.socket.receive({ v: 1, type: "error", id: held.id,
        code: "OPERATION_FAILED", message: "Unklar", retryable: false, outcome: "unknown" })
        : gateway.socket.result(held, { requested: "ultra", observed, observation: status });
      if (order === "info-first") { publish(); expect(view().composer.reasoning.status).toBe("pending"); receipt(); await pending; }
      else { receipt(); await pending; publish(); }
      expect(view().composer.reasoning).toEqual({ requested: "ultra", status, observed: observed.reasoning });
      expect(view().composer.settings).toEqual(observed); expect(gateway.sent.filter((frame) => frame.op === "reasoning.select")).toHaveLength(1);
    });
  }
  it.each(["different", "away-return", "snapshot"] as const)("%s entwertet alten Reasoningreceipt weiterhin", async (kind) => {
    let held!: HermesV2ClientMessage; gateway.handle = (frame) => { if (frame.op !== "reasoning.select") return false; held = frame; return true; };
    const pending = actions().selectReasoning("ultra"); await settle(); const before = runtime.store.get("a");
    if (kind === "snapshot") gateway.socket.receive({ v: 1, type: "snapshot", snapshot: composerSnapshot() });
    else { info({ provider: "test", model: "other" }); if (kind === "away-return") info(selection, { effort: "low", wire: "low" }); }
    gateway.socket.result(held, { requested: "ultra", observed: settings, observation: "observed" }); await pending;
    expect(view().composer.reasoning.status).toBe("idle"); expect(view().composer.reasoning.requested).toBeNull();
    if (kind !== "snapshot") expect(runtime.store.get("a").modelRevision).toBeGreaterThan(before.modelRevision);
    if (kind === "away-return") expect(view().composer.settings?.reasoning).toEqual({ effort: "low", wire: "low" });
  });
  it("identische Info-Beobachtung entwertet weiterhin alten Modellreceipt und Kostenbestätigung", async () => {
    let held!: HermesV2ClientMessage; const target = { provider: "test", model: "other" };
    gateway.handle = (frame) => { if (frame.op !== "model.select") return false; held = frame; return true; };
    const pending = actions().selectModel(target); await settle(); info();
    gateway.socket.result(held, { selection: target, deferred: false, confirmation: null }); await pending;
    expect(runtime.store.get("a").selection).toEqual(selection);
    gateway.handle = (frame, socket) => { if (frame.op !== "model.select") return false; socket.result(frame, { selection: target, deferred: false, confirmation: "Kosten" }); return true; };
    await actions().selectModel(target); expect(view().composer.model.status).toBe("confirmation"); info();
    const count = gateway.sent.filter((frame) => frame.op === "model.select").length;
    await actions().selectModel(target, true); expect(gateway.sent.filter((frame) => frame.op === "model.select")).toHaveLength(count);
    expect(view().composer.model.confirmation).toBeNull();
  });
});
