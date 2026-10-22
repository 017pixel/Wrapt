import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { event, settle, snapshot } from "./chat-test-fixtures";
import { workFixture, workOwner, workRoster, workChild, type WorkFixture } from "./chat-work-test-fixtures";

describe("Native Workaktionen und Ergebnissicherheit", () => {
  let f: WorkFixture;
  beforeEach(async () => { vi.useFakeTimers(); f = await workFixture(); });
  afterEach(() => { f.cleanup(); vi.useRealTimers(); });
  const frames = (op: HermesV2ClientMessage["op"]) => f.gateway.sent.filter((frame) => frame.op === op);
  it.each(["interrupt", "tail", "kill"] as const)("weist ein fremdes %s-Ziel bereits vor Send zurück", async (action) => {
    if (action === "interrupt") await f.actions.interruptSubagent("foreign");
    if (action === "tail") await f.actions.readSubagentTail("foreign");
    if (action === "kill") await f.actions.killProcess("foreign");
    expect(frames(action === "kill" ? "work.process.kill" : action === "tail" ? "work.subagent.tail" : "work.subagent.interrupt")).toHaveLength(0);
    expect(f.runtime.owners.getView("owner").actionError?.code).toBe("TARGET_UNAVAILABLE");
  });
  it("unterscheidet Prozesskennung, Kindkennung und beide Delegationsidentitäten", async () => {
    f.setRoster(workRoster({ delegations: [{ kind: "delegation", delegationId: "failure", taskIndex: 0, error: "Fehlgeschlagen", status: "failed", goal: null, dispatchedAt: null, completedAt: null }] }));
    await f.actions.refreshWork(); await f.actions.interruptSubagent("failure"); await f.actions.killProcess("child");
    expect(frames("work.subagent.interrupt")).toHaveLength(0); expect(frames("work.process.kill")).toHaveLength(0);
    await f.actions.interruptSubagent("child"); await f.actions.killProcess("proc");
    expect(frames("work.subagent.interrupt")[0]).toMatchObject({ subagentId: "child" });
    expect(frames("work.process.kill")[0]).toMatchObject({ processId: "proc" });
  });
  it("erhält found=false und available=false als bestätigte tatsächliche Antworten", async () => {
    f.setHandler((frame, socket) => {
      if (frame.op === "work.subagent.interrupt") { socket.result(frame, { id: frame.subagentId, found: false }); return true; }
      if (frame.op === "work.subagent.tail") { socket.result(frame, { id: frame.subagentId, available: false, text: "", truncated: true }); return true; }
      return false;
    });
    await f.actions.interruptSubagent("child"); await f.actions.readSubagentTail("child");
    expect(f.view().actions.map((row) => row.result)).toEqual([{ kind: "subagent.interrupt", id: "child", found: false }, { kind: "subagent.tail", id: "child", available: false, text: "", truncated: true }]);
    expect(f.view().actions.every((row) => row.status === "confirmed")).toBe(true);
  });
  it.each(["killed", "already_exited", "not_found", "error"] as const)("erhält den konkreten Killstatus %s", async (status) => {
    f.setHandler((frame, socket) => { if (frame.op !== "work.process.kill") return false; socket.result(frame, { id: frame.processId, status, exitCode: 17, output: "Ende", error: status === "error" ? "Fehler" : null }); return true; });
    await f.actions.killProcess("proc");
    expect(f.view().actions.at(-1)).toMatchObject({ status: "confirmed", result: { kind: "process.kill", status, exitCode: 17, output: "Ende" } });
  });
  it.each(["subagent.interrupt", "subagent.tail", "process.kill", "background", "btw", "steer"] as const)("fasst identische offene %s-Aufrufe synchron zusammen", async (action) => {
    let held: HermesV2ClientMessage | undefined;
    const op = action === "steer" ? "session.steer" : `work.${action}`;
    f.setHandler((frame) => { if (frame.op === op) { held = frame; return true; } return false; });
    const run = () => action === "subagent.interrupt" ? f.actions.interruptSubagent("child") : action === "subagent.tail" ? f.actions.readSubagentTail("child")
      : action === "process.kill" ? f.actions.killProcess("proc") : action === "background" ? f.actions.startBackground("Auftrag") : action === "btw" ? f.actions.startBtw("Auftrag") : f.actions.steer("Auftrag");
    const first = run(), second = run(); await settle(); expect(frames(op as HermesV2ClientMessage["op"])).toHaveLength(1);
    if (action === "subagent.interrupt") f.gateway.socket.result(held!, { id: "child", found: true });
    else if (action === "subagent.tail") f.gateway.socket.result(held!, { id: "child", available: true, text: "Ausgabe", truncated: false });
    else if (action === "process.kill") f.gateway.socket.result(held!, { id: "proc", status: "killed", exitCode: null, output: "", error: null });
    else if (action === "steer") f.gateway.socket.result(held!, { status: "rejected" });
    else f.gateway.socket.result(held!, { kind: action, taskId: "task" });
    await Promise.all([first, second]); expect(f.view().actions).toHaveLength(1);
  });
  it("lässt verschiedene Ziele und Wünsche unabhängig offen", async () => {
    f.setRoster(workRoster({ subagents: [workChild("child"), workChild("other")] })); await f.actions.refreshWork();
    f.setHandler((frame) => frame.op === "work.subagent.interrupt" || frame.op === "work.background");
    void f.actions.interruptSubagent("child"); void f.actions.interruptSubagent("other"); void f.actions.startBackground("eins"); void f.actions.startBackground("zwei"); await settle();
    expect(frames("work.subagent.interrupt")).toHaveLength(2); expect(frames("work.background")).toHaveLength(2);
  });
  it.each(["hidden", "parked", "readonly", "snapshot", "selection"] as const)("sendet einen %s gewordenen Schreibklick nach Await nicht", async (boundary) => {
    queueMicrotask(() => {
      if (boundary === "hidden" || boundary === "parked") { f.runtime.update({ ...workOwner(), [boundary === "hidden" ? "visible" : "active"]: false }); f.runtime.update(workOwner()); }
      if (boundary === "snapshot" || boundary === "readonly") f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { writable: boundary !== "readonly" }) });
      if (boundary === "selection") { f.runtime.update(workOwner("b")); f.runtime.update(workOwner()); }
    });
    await f.actions.startBackground("Nicht später nachsenden");
    expect(frames("work.background")).toHaveLength(0); expect(f.view().tasks).toEqual([]);
  });
  it("sendet initial readonly weder jetzt noch nach späterer Bereitschaft", async () => {
    f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { writable: false }) });
    await f.actions.startBackground("Alt"); f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a") }); await settle();
    expect(frames("work.background")).toHaveLength(0);
    await f.actions.startBackground("Bewusster neuer Klick"); expect(frames("work.background")).toHaveLength(1);
  });
  it("verwirft späte Mutationsresultate nach Hidden-A→B→A", async () => {
    let held: HermesV2ClientMessage | undefined;
    f.setHandler((frame) => { if (frame.op === "work.background") { held = frame; return true; } return false; });
    const action = f.actions.startBackground("Alt"); await settle();
    f.runtime.update({ ...workOwner(), visible: false }); f.runtime.update(workOwner());
    f.gateway.socket.result(held!, { kind: "background", taskId: "old-task" }); await action;
    expect(f.view().tasks.some((row) => row.id === "old-task")).toBe(false); expect(f.view().actions).toEqual([]);
  });
  it.each(["work.subagent.interrupt", "work.process.kill"] as const)("hält den erkannten Postsend-Zielwiderspruch bei %s unknown", async (op) => {
    f.setHandler((frame, socket) => {
      if (frame.op !== op) return false;
      socket.result(frame, op === "work.subagent.interrupt" ? { id: "foreign", found: true } : { id: "foreign", status: "killed", exitCode: null, output: "", error: null }); return true;
    });
    if (op === "work.subagent.interrupt") await f.actions.interruptSubagent("child"); else await f.actions.killProcess("proc");
    expect(f.view().actions.at(-1)).toMatchObject({ status: "unknown", result: null, error: { outcome: "unknown" } });
    await vi.advanceTimersByTimeAsync(30_000); expect(frames(op)).toHaveLength(1);
  });
  it("hält einen verlorenen Write unknown und liest nur auf ausdrücklichen Wunsch neu", async () => {
    f.setHandler((frame) => frame.op === "work.background");
    const action = f.actions.startBackground("Einmal"); await settle(); await vi.advanceTimersByTimeAsync(25_000); await action;
    expect(f.view().actions.at(-1)?.status).toBe("unknown");
    await f.actions.refreshWork(); await vi.advanceTimersByTimeAsync(30_000);
    expect(frames("work.background")).toHaveLength(1); expect(f.view().actions.at(-1)?.status).toBe("unknown");
  });
  it("bewahrt die Hauptturn-Stopreserve während ausstehender Workaktionen", async () => {
    f.setHandler((frame) => frame.op === "work.background");
    for (let index = 0; index < 32; index++) void f.actions.startBackground(`Auftrag ${index}`);
    await settle(); await f.actions.stop();
    expect(frames("work.background")).toHaveLength(32); expect(frames("session.stop")).toHaveLength(1);
  });
  it("liest Tail nur auf bewussten Klick und übernimmt keine fremde Tailkennung", async () => {
    expect(frames("work.subagent.tail")).toHaveLength(0);
    f.setHandler((frame, socket) => { if (frame.op !== "work.subagent.tail") return false; socket.result(frame, { id: "foreign", available: true, text: "Fremd", truncated: false }); return true; });
    await f.actions.readSubagentTail("child");
    expect(f.view().actions.at(-1)).toMatchObject({ status: "not_sent", result: null });
  });
  it("beendet durch einen konkreten Nebenabschluss den Hauptturn nicht", async () => {
    f.gateway.socket.event(event("message.started", 1, { turnId: "main" }));
    f.gateway.socket.event(event("work.updated", 2, { revision: 1, change: { kind: "btw", id: "external-complete", status: "completed", text: "Fertig" } }));
    expect(f.runtime.store.get("a").running).toBe(true); expect(f.view().tasks[0]).toMatchObject({ id: "external-complete", status: "completed" });
  });
});
