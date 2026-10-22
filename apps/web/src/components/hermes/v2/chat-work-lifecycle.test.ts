// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { event, settle, snapshot } from "./chat-test-fixtures";
import { workFixture, workOwner, workRoster, type WorkFixture } from "./chat-work-test-fixtures";
import { useAppPreferences } from "../../../stores/appPreferences";

describe("Workkontexte vor und nach tatsächlichem Send", () => {
  let f: WorkFixture;
  beforeEach(async () => { vi.useFakeTimers(); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); f = await workFixture(); });
  afterEach(async () => { f.cleanup(); await settle(); vi.restoreAllMocks(); vi.useRealTimers(); });
  const writes = () => f.gateway.sent.filter((frame) => frame.op === "work.background");
  it.each(["hidden", "parked", "document", "readonly", "offline", "resync", "flagoff", "release"] as const)("sendet den initialen %s-Klick nicht später nach", async (boundary) => {
    if (boundary === "hidden") f.runtime.update({ ...workOwner(), visible: false });
    if (boundary === "parked") f.runtime.update({ ...workOwner(), active: false });
    if (boundary === "document") vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    if (boundary === "readonly") f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { writable: false }) });
    if (boundary === "offline") f.gateway.socket.drop();
    if (boundary === "resync") { f.setHandler((frame) => frame.op === "session.subscribe"); void f.runtime.ensureSubscribed("a", true).catch(() => {}); await settle(); }
    if (boundary === "flagoff") useAppPreferences.setState({ hermesV2Enabled: false });
    if (boundary === "release") f.release();
    await f.actions.startBackground("Alter Klick");
    if (boundary === "hidden" || boundary === "parked") f.runtime.update(workOwner());
    if (boundary === "document") vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    if (boundary === "readonly") f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a") });
    await settle(); expect(writes()).toHaveLength(0);
  });
  it.each(["documentABA", "flagABA", "ownerABA", "socket", "subscription", "cwdABA"] as const)("prüft %s unmittelbar vor dem tatsächlichen Send erneut", async (boundary) => {
    queueMicrotask(() => {
      if (boundary === "documentABA") {
        const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange"));
        visibility.mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange"));
      }
      if (boundary === "flagABA") { useAppPreferences.setState({ hermesV2Enabled: false }); useAppPreferences.setState({ hermesV2Enabled: true }); f.runtime.acquire(workOwner()); }
      if (boundary === "ownerABA") { f.release(); f.runtime.acquire(workOwner()); }
      if (boundary === "socket") f.gateway.socket.drop();
      if (boundary === "subscription") void f.runtime.ensureSubscribed("a", true).catch(() => {});
      if (boundary === "cwdABA") {
        f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { session: { ...snapshot().session, cwd: "/other" } }) });
        f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a") });
      }
    });
    await f.actions.startBackground("Nicht wiederbeleben"); await settle();
    expect(writes()).toHaveLength(0);
  });
  it.each(["selectionABA", "ownerABA", "snapshot", "flagABA", "socket"] as const)("übernimmt einen nach Send verlorenen %s-Kontext nicht in neue Tasks", async (boundary) => {
    let held: HermesV2ClientMessage | undefined;
    f.setHandler((frame) => { if (frame.op === "work.background") { held = frame; return true; } return false; });
    const oldSocket = f.gateway.socket, action = f.actions.startBackground("Alter Auftrag"); await settle();
    expect(writes()).toHaveLength(1);
    if (boundary === "selectionABA") { f.runtime.update(workOwner("b")); await settle(); f.runtime.update(workOwner()); await settle(); }
    if (boundary === "ownerABA") { f.release(); f.runtime.acquire(workOwner()); }
    if (boundary === "snapshot") f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a") });
    if (boundary === "flagABA") { useAppPreferences.setState({ hermesV2Enabled: false }); useAppPreferences.setState({ hermesV2Enabled: true }); f.runtime.acquire(workOwner()); await settle(); }
    if (boundary === "socket") { f.gateway.socket.drop(); await vi.advanceTimersByTimeAsync(250); await settle(); }
    oldSocket.result(held!, { kind: "background", taskId: "old-result" }); await action;
    expect(f.view().tasks.some((row) => row.id === "old-result")).toBe(false);
    await vi.advanceTimersByTimeAsync(30_000); expect(writes()).toHaveLength(1);
  });
  it("behält einen Socketverlust nach Send bis zum neuen Snapshot als unknown", async () => {
    f.setHandler((frame) => frame.op === "work.background");
    const action = f.actions.startBackground("Einmal"); await settle(); f.gateway.socket.drop(); await action;
    expect(f.view().actions.at(-1)).toMatchObject({ status: "unknown", error: { outcome: "unknown" } });
    expect(writes()).toHaveLength(1);
  });
  it("dedupliziert nur denselben Owner und lässt bewusst verschiedene Owner unabhängig", async () => {
    f.runtime.acquire(workOwner("a", "second")); await settle();
    f.setHandler((frame) => frame.op === "work.background");
    void f.actions.startBackground("Gleich"); void f.runtime.actionsFor("second").startBackground("Gleich"); await settle();
    expect(writes()).toHaveLength(2);
  });
  it("dedupliziert auch synchron reentrante Statuslistener vor dem ersten Await", async () => {
    let repeated = false;
    f.setHandler((frame) => frame.op === "work.background");
    const stop = f.runtime.owners.subscribe("owner", () => { if (!repeated && f.view().actions.some((row) => row.status === "pending")) { repeated = true; void f.actions.startBackground("Gleich"); } });
    void f.actions.startBackground("Gleich"); await settle(); stop();
    expect(repeated).toBe(true); expect(writes()).toHaveLength(1);
  });
  it("macht doppelte offene Hauptturn-Stops zu einer einzelnen Nativeoperation", async () => {
    let held: HermesV2ClientMessage | undefined;
    f.setHandler((frame) => { if (frame.op === "session.stop") { held = frame; return true; } return false; });
    const first = f.actions.stop(), second = f.actions.stop(); await settle();
    expect(f.gateway.sent.filter((frame) => frame.op === "session.stop")).toHaveLength(1);
    f.gateway.socket.result(held!, { status: "interrupted" }); await Promise.all([first, second]);
  });
  it("begrenzt abgeschlossene Actionresultate ohne noch offene Aktionen zu verlieren", async () => {
    for (let index = 0; index < 45; index++) await f.actions.startBackground(`Auftrag ${index}`);
    expect(f.view().actions).toHaveLength(32);
    expect(f.view().actions.at(-1)?.text).toBe("Auftrag 44");
  });
  it("erhält Eltern-/Modellbelege aus echten Gateway-Teilpatches und dedupliziert Sequenzen", () => {
    const patch = event("work.updated", 2, { revision: 2, change: { kind: "subagent", id: "child", toolCount: 4 } });
    f.gateway.socket.event(patch); f.gateway.socket.event(patch);
    expect(f.view().subagents).toHaveLength(1);
    expect(f.view().subagents[0]).toMatchObject({ goal: "Echte Aufgabe", model: "test:model", startedAt: 10, toolCount: 4 });
  });
  it("darf einen bewusst neuen Write nach not_sent einmal ausführen", async () => {
    f.setHandler((frame, socket) => { if (frame.op !== "work.background") return false; socket.receive({ v: 1, type: "error", id: frame.id, code: "SESSION_UNAVAILABLE", message: "Nicht gesendet", retryable: false, outcome: "not_sent" }); return true; });
    await f.actions.startBackground("Auftrag"); expect(f.view().actions.at(-1)?.status).toBe("not_sent");
    f.setHandler(null); await f.actions.startBackground("Auftrag");
    expect(writes()).toHaveLength(2); expect(f.view().actions.at(-1)?.status).toBe("confirmed");
  });
  it("behauptet bei leerem Reconnectroster keine unbekannten laufenden Tasks", async () => {
    await f.actions.startBackground("Bestätigter eigener Start");
    f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a") });
    f.setRoster(workRoster({ tasks: [], subagents: [], processes: [] })); await f.actions.refreshWork();
    expect(f.view().tasks).toEqual([]); expect(f.view().coverage?.tasks).toBe("observed-partial");
  });
  it("behauptet für einen vollständig gelesenen Roster mit unbekanntem Status keine belegte Null", async () => {
    f.setRoster(workRoster({ subagents: [{ ...workRoster().subagents[0]!, status: null }], processes: [{ ...workRoster().processes[0]!, status: "unbekannt" }] }));
    await f.actions.refreshWork(); expect(f.view().counts).toMatchObject({ subagents: null, processes: null });
  });
  it("ersetzt Actionprojektionen unveränderlich und verändert ältere Viewmodelstände nicht", async () => {
    let held: HermesV2ClientMessage | undefined;
    f.setHandler((frame) => { if (frame.op === "work.background") { held = frame; return true; } return false; });
    const action = f.actions.startBackground("Auftrag"); await settle();
    const before = f.view().actions;
    f.gateway.socket.result(held!, { kind: "background", taskId: "task" }); await action;
    expect(before[0]?.status).toBe("pending"); expect(f.view().actions).not.toBe(before);
    expect(f.view().actions[0]?.status).toBe("confirmed");
  });
});
