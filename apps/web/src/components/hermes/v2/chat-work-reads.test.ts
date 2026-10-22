import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { event, settle, snapshot } from "./chat-test-fixtures";
import { workFixture, workOwner, workRoster, type WorkFixture } from "./chat-work-test-fixtures";
import { useAppPreferences } from "../../../stores/appPreferences";

describe("Sichtbare begrenzte Workreads", () => {
  let f: WorkFixture;
  beforeEach(async () => { vi.useFakeTimers(); f = await workFixture(); });
  afterEach(() => { f.cleanup(); vi.useRealTimers(); });
  const reads = () => f.gateway.sent.filter((frame) => frame.op === "work.read");
  const holdRead = () => {
    let pending: HermesV2ClientMessage | undefined;
    f.setHandler((frame) => { if (frame.op === "work.read") { pending = frame; return true; } return false; });
    return () => pending!;
  };
  it("liest nur die ausgewählte Session und erzeugt keinen Socket oder Lease pro Summary", async () => {
    f.runtime.store.setList({ items: Array.from({ length: 20 }, (_, index) => snapshot(`s${index}`, { running: true }).session), loading: false, error: null, hasMore: false });
    await f.actions.refreshWork();
    expect(reads().every((frame) => frame.sessionId === "a")).toBe(true);
    expect(f.gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(1);
    expect(f.gateway.sockets).toHaveLength(1);
  });
  it("lädt beim Sichtbarwerden neu und sendet Hidden-/Park-/Flagoff-Reads nicht", async () => {
    const before = reads().length;
    f.runtime.update({ ...workOwner(), visible: false }); await f.actions.refreshWork();
    f.runtime.update({ ...workOwner(), active: false }); await f.actions.refreshWork();
    expect(reads()).toHaveLength(before);
    f.runtime.update(workOwner()); await vi.advanceTimersByTimeAsync(0); await settle();
    expect(reads()).toHaveLength(before + 1);
    useAppPreferences.setState({ hermesV2Enabled: false }); await f.actions.refreshWork();
    expect(reads()).toHaveLength(before + 1);
  });
  it("behält eine partielle oder leere Reconnectsicht ausdrücklich partiell", async () => {
    f.setRoster(workRoster({ subagents: [], processes: [], tasks: [], coverage: { ...workRoster().coverage, truncated: true } }));
    await f.actions.refreshWork();
    expect(f.view()).toMatchObject({ counts: { subagents: 0, processes: 0, tasks: 0 }, coverage: { truncated: true, tasks: "observed-partial" } });
  });
  it("fasst viele Invalidierungen mit höchstens einem laufenden Read plus Folgeabgleich zusammen", async () => {
    const held = holdRead(), before = reads().length;
    for (let seq = 1; seq <= 40; seq++) f.gateway.socket.event(event("work.invalidated", seq, { revision: seq, reason: "roster" }));
    await vi.advanceTimersByTimeAsync(200); await settle();
    expect(reads()).toHaveLength(before + 1);
    for (let seq = 41; seq <= 80; seq++) f.gateway.socket.event(event("work.invalidated", seq, { revision: seq, reason: "roster" }));
    await vi.advanceTimersByTimeAsync(1000); expect(reads()).toHaveLength(before + 1);
    f.gateway.socket.result(held(), workRoster({ revision: 0 })); await settle();
    f.setHandler(null); f.setRoster(workRoster({ revision: 80 }));
    await vi.advanceTimersByTimeAsync(200); await settle();
    expect(reads()).toHaveLength(before + 2); expect(f.view().revision).toBe(80);
    await vi.advanceTimersByTimeAsync(10_000); expect(reads()).toHaveLength(before + 2);
  });
  it("verwirft einen älteren Vollroster über neueren Teilpatches", async () => {
    const held = holdRead(), reading = f.actions.refreshWork(); await settle();
    f.gateway.socket.event(event("work.updated", 1, { revision: 8, change: { kind: "subagent", id: "child", goal: "Neuer Beleg" } }));
    f.gateway.socket.result(held(), workRoster({ revision: 7 })); await reading;
    expect(f.view().subagents[0]?.goal).toBe("Neuer Beleg"); expect(f.view().error?.code).toBe("STALE_READ");
  });
  it.each(["selection", "hidden", "parked", "snapshot", "subscription", "cwd"] as const)("verwirft %s-A→B→A-Antworten", async (boundary) => {
    const held = holdRead(), reading = f.actions.refreshWork(); await settle();
    if (boundary === "selection") { f.runtime.update(workOwner("b")); await settle(); f.runtime.update(workOwner()); await settle(); }
    if (boundary === "hidden" || boundary === "parked") { f.runtime.update({ ...workOwner(), [boundary === "hidden" ? "visible" : "active"]: false }); f.runtime.update(workOwner()); }
    if (boundary === "snapshot" || boundary === "cwd") {
      f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", boundary === "cwd" ? { session: { ...snapshot().session, cwd: "/other" } } : {}) });
      if (boundary === "cwd") f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a") });
    }
    if (boundary === "subscription") { void f.runtime.ensureSubscribed("a", true); await settle(); }
    f.gateway.socket.result(held(), workRoster({ revision: 200, queuedText: "Alter Read" })); await reading; await settle();
    expect(f.runtime.store.get("a").work.revision).not.toBe(200);
    expect(f.runtime.store.get("a").work.queuedText).not.toBe("Alter Read");
  });
  it("hält unveränderte aktuelle Reads auch readonly möglich", async () => {
    f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { writable: false }) });
    await f.actions.refreshWork(); expect(f.view().subagents).toHaveLength(1);
    expect(f.view().available).toBe(true);
  });
  it("invalidiert keine Workreads durch reine Texttokens", async () => {
    const before = reads().length;
    for (let seq = 1; seq < 100; seq++) f.gateway.socket.event(event("message.delta", seq, { turnId: "turn", text: "t" }));
    await vi.advanceTimersByTimeAsync(10_000); expect(reads()).toHaveLength(before);
  });
  it("führt nach Flagoff keinen geplanten oder fremden späten Read aus", async () => {
    f.gateway.socket.event(event("work.invalidated", 1, { revision: 2, reason: "queue" }));
    const before = reads().length; useAppPreferences.setState({ hermesV2Enabled: false });
    await vi.advanceTimersByTimeAsync(1000); expect(reads()).toHaveLength(before); expect(f.gateway.socket.readyState).toBe(3);
  });
});
