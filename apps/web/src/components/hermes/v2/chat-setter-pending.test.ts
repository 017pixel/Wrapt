// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, event, settle } from "./chat-test-fixtures";
import { composerCatalog, composerSnapshot, selection, settings } from "./chat-composer-test-fixtures";

describe("Offene Setter und nachgewiesene Postsend-Korrelation", () => {
  let runtime: ChatRuntime, gateway: TestGateway, held: HermesV2ClientMessage[];
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const kinds = ["model.select", "session.title", "reasoning.select"] as const;
  const invoke = (kind: typeof kinds[number], value = "old", id = "one") => {
    const actions = runtime.actionsFor(id);
    return kind === "model.select" ? actions.selectModel({ provider: "test", model: value })
      : kind === "session.title" ? actions.setTitle(value) : actions.selectReasoning(value === "old" ? "low" : "ultra");
  };
  const receipt = (frame: HermesV2ClientMessage) => {
    if (frame.op === "model.select") gateway.socket.result(frame, { selection: frame.selection, deferred: false, confirmation: null });
    if (frame.op === "session.title") gateway.socket.result(frame, { title: frame.title, pending: false });
    if (frame.op === "reasoning.select") gateway.socket.result(frame, { requested: frame.effort, observation: "observed",
      observed: { ...settings, reasoning: { effort: frame.effort, wire: frame.effort } } });
  };
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); gateway.composer = true;
    gateway.snapshots.set("a", composerSnapshot()); gateway.catalogs.set("a", composerCatalog()); runtime = new ChatRuntime(gateway.createClient());
    runtime.acquire(owner); await settle(); await runtime.actionsFor("one").readCatalog(); held = [];
    gateway.handle = (frame) => {
      if (kinds.includes(frame.op as typeof kinds[number])) { held.push(frame); return true; }
      return frame.op === "session.subscribe";
    };
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it.each(kinds)("%s: alter noch offener Wunsch bleibt auch hinter neuer Auswahl gegen Duplikate gesperrt", async (kind) => {
    const first = invoke(kind); await settle(); const second = invoke(kind, "new"); await settle();
    const current = runtime.owners.getView("one").composer;
    await invoke(kind); expect(held).toHaveLength(2);
    expect(runtime.owners.getView("one").composer).toEqual(current);
    receipt(held[0]!); await first; receipt(held[1]!); await second;
    if (kind === "model.select") expect(runtime.store.get("a").selection?.model).toBe("new");
    if (kind === "session.title") expect(runtime.store.get("a").session?.title).toBe("new");
    if (kind === "reasoning.select") expect(runtime.store.get("a").composer?.reasoning).toEqual({ effort: "ultra", wire: "ultra" });
  });
  it.each(kinds)("%s: zwei Owner dürfen denselben bewussten Wunsch unabhängig senden", async (kind) => {
    runtime.acquire({ ...owner, ownerId: "two" }); await settle();
    const first = invoke(kind); await settle(); const second = invoke(kind, "old", "two"); await settle();
    expect(held).toHaveLength(2); receipt(held[0]!); await first; receipt(held[1]!); await second;
  });
  for (const observation of ["info", "snapshot"] as const) {
    it.each(kinds)(`${observation}: offene gleiche %s-Aktion bleibt trotz neuer Beobachtung gegen Doppelsend gesperrt`, async (kind) => {
      const first = invoke(kind); await settle();
      if (observation === "info") gateway.socket.event(event("session.updated", 1,
        { session: composerSnapshot().session, selection, turnStartedAt: null, composer: settings }));
      else gateway.socket.receive({ v: 1, type: "snapshot", snapshot: composerSnapshot() });
      await invoke(kind); expect(held).toHaveLength(1); receipt(held[0]!); await first;
    });
  }
  it.each(kinds)("%s: nach abgeschlossener oder unklarer Antwort ist ein neuer bewusster Klick möglich", async (kind) => {
    const first = invoke(kind); await settle();
    gateway.socket.receive({ v: 1, type: "error", id: held[0]!.id, code: "OPERATION_FAILED", message: "Unklar", retryable: false, outcome: "unknown" }); await first;
    const second = invoke(kind); await settle(); expect(held).toHaveLength(2); receipt(held[1]!); await second;
  });
  it.each(["model.select", "reasoning.select"] as const)("%s: widersprüchlicher Receipt ist unknown und verändert keine Ist-Auswahl", async (kind) => {
    const before = runtime.store.get("a"); const pending = invoke(kind); await settle(); const frame = held[0]!;
    if (kind === "model.select") gateway.socket.result(frame, { selection: { provider: "test", model: "foreign" }, deferred: false, confirmation: null });
    else {
      gateway.socket.event(event("session.updated", 1, { session: composerSnapshot().session, selection, turnStartedAt: null, composer: settings }));
      gateway.socket.result(frame, { requested: "ultra", observed: { ...settings, reasoning: { effort: "foreign", wire: "foreign" } }, observation: "observed" });
    }
    await pending; const view = runtime.owners.getView("one");
    expect(view.actionError).toMatchObject({ code: "PROTOCOL_MISMATCH", outcome: "unknown" });
    expect(kind === "model.select" ? view.composer.model.status : view.composer.reasoning.status).toBe("unknown");
    expect(runtime.store.get("a").selection).toEqual(before.selection); expect(runtime.store.get("a").composer).toEqual(before.composer);
    await vi.advanceTimersByTimeAsync(60_000); expect(held).toHaveLength(1);
  });
});
