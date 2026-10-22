// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { composerCatalog, composerSnapshot, selection, settings } from "./chat-composer-test-fixtures";

describe("Belegte Composer-Einstellungen und Auswahlreceipts", () => {
  let runtime: ChatRuntime, gateway: TestGateway;
  const owner = { ownerId: "one", sessionId: "a", onSelectSession: vi.fn(), active: true, visible: true };
  const actions = () => runtime.actionsFor("one");
  const view = () => runtime.owners.getView("one").composer;
  const target = { provider: "test", model: "model-b" };
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); gateway.composer = true;
    gateway.snapshots.set("a", composerSnapshot()); gateway.catalogs.set("a", composerCatalog());
    runtime = new ChatRuntime(gateway.createClient()); runtime.acquire(owner); await settle(); await actions().readCatalog();
  });
  afterEach(() => { runtime.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("kombiniert Opt-ins in einem Socket und projiziert tatsächliche globale readonly-Approvals", () => {
    expect(new URL(gateway.socket.url).searchParams.get("composer")).toBe("1");
    expect(runtime.client.getComposerBinding()?.id).toBe(gateway.socket.connectionId);
    expect(gateway.sockets).toHaveLength(1); expect(view().available).toBe(true);
    expect(view().settings).toEqual(settings); expect(view().settings?.approvals).toMatchObject({ scope: "global", editable: false });
    expect(runtime.store.get("a").catalog.hermesEfforts).toContain("high");
  });
  it("fehlende optionale Composerfelder bleiben unbekannt statt Wunschwerte zu erfinden", () => {
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot() });
    expect(view().settings).toBeNull(); expect(view().reasoning.observed).toBeNull();
  });
  it("Kostenbestätigung ist an Auswahl und aktuellen Kontext gebunden", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "model.select") return false;
      socket.result(frame, { selection: frame.selection, deferred: false, confirmation: frame.confirmed ? null : "Kosten bestätigen" }); return true;
    };
    await actions().selectModel(target);
    expect(view().model).toMatchObject({ requested: target, status: "confirmation", confirmation: { selection: target, message: "Kosten bestätigen" } });
    const count = gateway.sent.filter((frame) => frame.op === "model.select").length;
    await actions().selectModel({ provider: "test", model: "other" }, true);
    expect(gateway.sent.filter((frame) => frame.op === "model.select")).toHaveLength(count);
    await actions().selectModel(target, true);
    expect(gateway.sent.filter((frame) => frame.op === "model.select").at(-1)).toMatchObject({ selection: target, confirmed: true });
  });
  it("Snapshot- oder Ownerwechsel entwertet eine frühere Kostenbestätigung", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "model.select") return false;
      socket.result(frame, { selection: frame.selection, deferred: false, confirmation: "Kosten" }); return true;
    };
    await actions().selectModel(target);
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: composerSnapshot("a", { selection: target }) });
    expect(view().model.confirmation).toBeNull(); await actions().selectModel(target, true);
    expect(gateway.sent.filter((frame) => frame.op === "model.select")).toHaveLength(1);
  });
  it("deferred bleibt ein Wunsch und überschreibt keine beobachtete laufende Auswahl", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op === "model.select") { socket.result(frame, { selection: frame.selection, deferred: true, confirmation: null }); return true; }
      return frame.op === "session.subscribe";
    };
    await actions().selectModel(target); expect(view().model).toMatchObject({ requested: target, status: "deferred" });
    expect(runtime.store.get("a").selection).toEqual(selection);
  });
  it.each([false, true])("Titelantwort pending=%s unterscheidet Wunsch von gespeichertem Titel", async (pending) => {
    gateway.handle = (frame, socket) => { if (frame.op !== "session.title") return false; socket.result(frame, { title: frame.title, pending }); return true; };
    await actions().setTitle("  Neuer Titel  ");
    expect(view().title).toMatchObject({ requested: "Neuer Titel", title: "Neuer Titel", status: pending ? "unconfirmed" : "applied" });
    expect(runtime.store.get("a").session?.title).toBe(pending ? "a" : "Neuer Titel");
    if (!pending) expect(runtime.store.getList().items.find((row) => row.id === "a")?.title).toBe("Neuer Titel");
  });
  it("Reasoning trennt requested, beobachtete Agentstufe und Wirestufe", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "reasoning.select") return false;
      socket.result(frame, { requested: frame.effort, observed: settings, observation: "observed" }); return true;
    };
    await actions().selectReasoning("ultra");
    expect(view().reasoning).toMatchObject({ requested: "ultra", status: "observed", observed: { effort: "high", wire: "medium" } });
    expect(gateway.sent.find((frame) => frame.op === "reasoning.select")).toMatchObject({ effort: "ultra", selection });
  });
  it("unbestätigte Lazy-Agentwirkung wird nie zur beobachteten gewünschten Stufe", async () => {
    gateway.handle = (frame, socket) => {
      if (frame.op !== "reasoning.select") return false;
      socket.result(frame, { requested: frame.effort, observed: { ...settings, reasoning: { effort: null, wire: null } }, observation: "unconfirmed" }); return true;
    };
    await actions().selectReasoning("high"); expect(view().reasoning).toMatchObject({ requested: "high", status: "unconfirmed", observed: { effort: null, wire: null } });
  });
  it("none benötigt bestätigte Modellfähigkeit, die allgemeine Ladder ist kein Modellbeleg", async () => {
    const catalog = composerCatalog(); catalog.models.providers[0]!.models[0]!.canDisableReasoning = null;
    gateway.catalogs.set("a", catalog); await actions().readCatalog(); await actions().selectReasoning("none");
    expect(gateway.sent.filter((frame) => frame.op === "reasoning.select")).toHaveLength(0);
    expect(runtime.owners.getView("one").actionError?.code).toBe("EFFORT_UNAVAILABLE");
  });
  it("laufender oder unbekannter Turn erlaubt keine Effortmutation", async () => {
    for (const running of [true, null]) {
      gateway.socket.receive({ v: 1, type: "snapshot", snapshot: composerSnapshot("a", { running }) }); await actions().selectReasoning("high");
    }
    expect(gateway.sent.filter((frame) => frame.op === "reasoning.select")).toHaveLength(0);
  });
  it.each(["model.select", "reasoning.select", "session.title"] as const)("spätes %s überschreibt keine neue Auswahl/Epoche", async (operation) => {
    let held!: HermesV2ClientMessage;
    gateway.handle = (frame) => { if (frame.op !== operation) return false; held = frame; return true; };
    const pending = operation === "model.select" ? actions().selectModel(target) : operation === "reasoning.select" ? actions().selectReasoning("ultra") : actions().setTitle("Alt");
    await settle(); gateway.socket.receive({ v: 1, type: "snapshot", snapshot: composerSnapshot("a", { epoch: "next", selection: target }) });
    gateway.socket.receive({ v: 1, type: "error", id: held.id, code: "OPERATION_FAILED", message: "Alt", retryable: false, outcome: "unknown" }); await pending;
    expect(runtime.store.get("a").selection).toEqual(target); expect(runtime.owners.getView("one").actionError).toBeNull();
    expect(view().model.status).toBe("idle"); expect(view().title.status).toBe("idle"); expect(view().reasoning.status).toBe("idle");
  });
  it("session.updated projiziert nur echte Composereinstellungen, keine globale Schreibaktion", () => {
    gateway.socket.event(event("session.updated", 1, { session: composerSnapshot().session, selection, turnStartedAt: null, composer: settings }));
    expect(view().settings).toEqual(settings); expect(gateway.sent.some((frame) => frame.op.includes("approval"))).toBe(false);
  });
});
