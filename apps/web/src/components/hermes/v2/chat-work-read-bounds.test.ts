import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage, HermesV2WorkPatch } from "@wrapt/contracts/hermes-v2";
import { settle } from "./chat-test-fixtures";
import { workFixture, workRoster, type WorkFixture } from "./chat-work-test-fixtures";
import { acceptedWorkTask, applyWorkPatch, applyWorkRoster, emptyWorkState } from "./chat-work-state";

describe("Vorab reservierte Workreads", () => {
  let f: WorkFixture;
  beforeEach(async () => { vi.useFakeTimers(); f = await workFixture(); });
  afterEach(async () => { f.cleanup(); await settle(); vi.useRealTimers(); });
  it.each(["owner", "session"] as const)("reserviert vor dem synchronen %s-Statuslistener", async (kind) => {
    const held: HermesV2ClientMessage[] = [];
    f.setHandler((frame) => { if (frame.op !== "work.read") return false; held.push(frame); return true; });
    let repeated = false, second: Promise<void> | undefined;
    const listener = () => {
      if (!repeated && f.runtime.store.get("a").work.loading) { repeated = true; second = f.actions.refreshWork(); }
    };
    const stop = kind === "owner" ? f.runtime.owners.subscribe("owner", listener) : f.runtime.store.subscribe("a", listener);
    const first = f.actions.refreshWork(); await settle(); stop();
    expect(repeated).toBe(true); expect(held).toHaveLength(1);
    f.gateway.socket.result(held[0]!, workRoster()); await Promise.all([first, second]);
    expect(f.view().loading).toBe(false);
    f.setHandler(null); await f.actions.refreshWork();
    expect(f.gateway.sent.filter((frame) => frame.op === "work.read")).toHaveLength(3);
  });
  it("gibt eine Readreservierung nach Fehler für den nächsten bewussten Read frei", async () => {
    f.setHandler((frame, socket) => {
      if (frame.op !== "work.read") return false;
      socket.receive({ v: 1, type: "error", id: frame.id, code: "STALE_REQUEST", message: "Veraltete Sicht", retryable: true, outcome: "not_sent" }); return true;
    });
    await f.actions.refreshWork(); expect(f.view().error?.code).toBe("STALE_REQUEST");
    f.setHandler(null); await f.actions.refreshWork();
    expect(f.view().error).toBeNull(); expect(f.view().loading).toBe(false);
    expect(f.gateway.sent.filter((frame) => frame.op === "work.read")).toHaveLength(3);
  });
});

describe("Ehrliche lokale Workbegrenzung", () => {
  it.each(["subagent", "delegation", "background", "btw"] as const)("kennzeichnet verworfene %s-Teilbelege als gekürzt", (kind) => {
    let state = applyWorkRoster(emptyWorkState(), workRoster({ subagents: [], processes: [] }));
    for (let index = 0; index < 101; index++) {
      const patch: HermesV2WorkPatch = kind === "delegation" ? { kind, delegationId: "same", taskIndex: index, error: "Fehler" }
        : kind === "subagent" ? { kind, id: `child${index}`, status: "running" } : { kind, id: `task${index}`, status: "running" };
      state = applyWorkPatch(state, index + 1, patch);
    }
    const rows = kind === "subagent" ? state.subagents : kind === "delegation" ? state.delegations : state.tasks;
    expect(rows).toHaveLength(100); expect(state.coverage?.truncated).toBe(true);
    expect(state.coverage?.tasks).toBe("observed-partial");
  });
  it("kennzeichnet auch durch eigene Startreceipts abgeschnittene Nebenaufgaben", () => {
    let state = applyWorkRoster(emptyWorkState(), workRoster());
    for (let index = 0; index < 101; index++) state = acceptedWorkTask(state, "background", `task${index}`);
    expect(state.tasks).toHaveLength(100); expect(state.coverage?.truncated).toBe(true);
    expect(state.tasks.some((task) => task.id === "task0")).toBe(false);
    expect(state.tasks.every((task) => task.status === "running")).toBe(true);
  });
  it("behält ohne tatsächlichen Belegverlust truncated=false auch am exakten Limit", () => {
    let state = applyWorkRoster(emptyWorkState(), workRoster({ subagents: [] }));
    for (let index = 0; index < 100; index++) state = applyWorkPatch(state, index + 1, { kind: "subagent", id: `child${index}` });
    state = applyWorkPatch(state, 101, { kind: "subagent", id: "child0", toolCount: 3 });
    expect(state.subagents).toHaveLength(100); expect(state.coverage?.truncated).toBe(false);
  });
  it("erhält Servertruncation und ersetzt sie erst durch einen neuen vollständigen Read", () => {
    let state = applyWorkRoster(emptyWorkState(), workRoster({ coverage: { ...workRoster().coverage, truncated: true } }));
    state = applyWorkPatch(state, 1, { kind: "subagent", id: "child", goal: "Neuer Beleg" });
    expect(state.coverage?.truncated).toBe(true);
    expect(applyWorkRoster(state, workRoster({ revision: 2 })).coverage?.truncated).toBe(false);
  });
  it("erfindet bei begrenzten Patches vor dem ersten Roster keine vollständige Abdeckung", () => {
    let state = emptyWorkState();
    for (let index = 0; index < 101; index++) state = applyWorkPatch(state, index + 1, { kind: "subagent", id: `child${index}` });
    expect(state.subagents).toHaveLength(100); expect(state.coverage).toBeNull(); expect(state.loaded).toBe(false);
  });
});
