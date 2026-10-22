import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { event, settle, snapshot, row } from "./chat-test-fixtures";
import { workFixture, workRoster, type WorkFixture } from "./chat-work-test-fixtures";

const actions = ["subagent.interrupt", "subagent.tail", "process.kill", "background", "btw", "steer", "queue"] as const;
type Action = typeof actions[number];
const operation = (action: Action) => action === "queue" ? "message.submit" : action === "steer" ? "session.steer" : `work.${action}`;
function invoke(f: WorkFixture, action: Action) {
  if (action === "subagent.interrupt") return f.actions.interruptSubagent("child");
  if (action === "subagent.tail") return f.actions.readSubagentTail("child");
  if (action === "process.kill") return f.actions.killProcess("proc");
  if (action === "background") return f.actions.startBackground("Wunsch");
  if (action === "btw") return f.actions.startBtw("Wunsch");
  if (action === "steer") return f.actions.steer("Wunsch");
  return f.actions.submit("Wunsch", "queue");
}
function receipt(f: WorkFixture, frame: HermesV2ClientMessage) {
  if (frame.op === "work.subagent.interrupt") f.gateway.socket.result(frame, { id: frame.subagentId, found: true });
  else if (frame.op === "work.subagent.tail") f.gateway.socket.result(frame, { id: frame.subagentId, available: true, text: "Alter Tail", truncated: false });
  else if (frame.op === "work.process.kill") f.gateway.socket.result(frame, { id: frame.processId, status: "killed", exitCode: 0, output: "", error: null });
  else if (frame.op === "work.background" || frame.op === "work.btw") f.gateway.socket.result(frame, { kind: frame.op.slice(5), taskId: "old-task" });
  else if (frame.op === "session.steer") f.gateway.socket.result(frame, { status: "queued" });
  else if (frame.op === "message.submit") f.gateway.socket.result(frame, { status: "queued", userRowId: null });
}

describe("Monotone Live-CWD-Grenzen und Queueabschluss", () => {
  let f: WorkFixture, seq: number;
  beforeEach(async () => { vi.useFakeTimers(); f = await workFixture(); seq = 0; });
  afterEach(async () => { f.cleanup(); await settle(); vi.useRealTimers(); });
  const info = (cwd: string | null) => f.gateway.socket.event(event("session.updated", ++seq, {
    session: { ...snapshot().session, cwd }, selection: null, turnStartedAt: null,
  }));

  it.each(actions)("sperrt die alte %s-Fortsetzung nach echten CWD-A→B→A-Infoevents", async (action) => {
    queueMicrotask(() => { info("/synthetic-other"); info(null); });
    await invoke(f, action); await settle();
    expect(f.gateway.sent.filter((frame) => frame.op === operation(action))).toHaveLength(0);
    expect(f.runtime.store.get("a").cwdRevision).toBe(2);
  });
  it.each(actions)("finalisiert %s nach gesendetem Write und CWD-A→B→A ehrlich", async (action) => {
    let held!: HermesV2ClientMessage;
    f.setHandler((frame) => { if (frame.op !== operation(action)) return false; held = frame; return true; });
    const request = invoke(f, action); await settle();
    info("/synthetic-other"); info(null); receipt(f, held); await request;
    expect(f.view().actions.at(-1)).toMatchObject({ status: action === "subagent.tail" ? "not_sent" : "unknown", result: null });
    expect(f.view().tasks).toEqual([]);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.gateway.sent.filter((frame) => frame.op === operation(action))).toHaveLength(1);
  });
  it.each(["read", "tail"] as const)("verwirft späten %s nach Live-CWD-A→B→A", async (kind) => {
    let held!: HermesV2ClientMessage;
    const op = kind === "read" ? "work.read" : "work.subagent.tail";
    f.setHandler((frame) => { if (frame.op !== op) return false; held = frame; return true; });
    const request = kind === "read" ? f.actions.refreshWork() : f.actions.readSubagentTail("child"); await settle();
    info("/synthetic-other"); info(null);
    f.gateway.socket.result(held, kind === "read" ? workRoster({ revision: 88, queuedText: "Alter Kopf" })
      : { id: "child", available: true, text: "Alter Tail", truncated: false });
    await request;
    expect(f.view().revision).not.toBe(88); expect(f.view().queue.head).not.toBe("Alter Kopf");
    if (kind === "tail") expect(f.view().actions.at(-1)).toMatchObject({ status: "not_sent", result: null });
  });
  it("lässt gleiche CWD-Infos und einen neuen bewussten Klick nach A→B→A zu", async () => {
    queueMicrotask(() => { info(null); info(null); });
    await f.actions.startBackground("Stabil");
    expect(f.view().actions.at(-1)?.status).toBe("confirmed"); expect(f.runtime.store.get("a").cwdRevision).toBe(0);
    info("/synthetic-other"); info(null);
    await f.actions.startBackground("Aktueller neuer Klick");
    expect(f.gateway.sent.filter((frame) => frame.op === "work.background")).toHaveLength(2);
    expect(f.view().actions.at(-1)?.status).toBe("confirmed");
  });
  it("beendet die ungültige Queuequittung unknown und erlaubt denselben neuen bewussten Wunsch", async () => {
    let held!: HermesV2ClientMessage;
    f.setHandler((frame) => { if (frame.op !== "message.submit") return false; held = frame; return true; });
    const first = f.actions.submit("Wunsch", "queue"); await settle();
    info("/synthetic-other"); receipt(f, held); await first;
    expect(f.view().actions.at(-1)).toMatchObject({ status: "unknown", result: null, error: { outcome: "unknown" } });
    expect(f.runtime.owners.getView("owner").submitting).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(f.gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
    f.setHandler(null); await f.actions.submit("Wunsch", "queue");
    expect(f.gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(2);
    expect(f.view().actions.at(-1)?.status).toBe("confirmed");
  });
  it("erhält trotz ungültigem Workreceipt die konkrete Optimistikkorrektur und neueren Draft", async () => {
    let held!: HermesV2ClientMessage;
    f.setHandler((frame) => { if (frame.op !== "message.submit") return false; held = frame; return true; });
    f.actions.setDraft("Alter Text"); const submitting = f.actions.submit(undefined, "queue"); await settle();
    f.actions.setDraft("Neuer Draft"); info("/synthetic-other"); receipt(f, held); await submitting;
    expect(f.runtime.store.get("a").messages.filter((message) => message.role === "user")).toEqual([]);
    expect(f.runtime.owners.getView("owner").draft).toBe("Neuer Draft");
    expect(f.view().actions.at(-1)?.status).toBe("unknown");
  });
  it("retaggt bei neuer Snapshotbarriere keine fremde Userrow durch die alte Queuequittung", async () => {
    let held!: HermesV2ClientMessage;
    f.setHandler((frame) => { if (frame.op !== "message.submit") return false; held = frame; return true; });
    const submitting = f.actions.submit("Alt", "queue"); await settle();
    f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { messages: [row(99, "Fremde echte Row", { role: "user" })] }) });
    f.gateway.socket.result(held, { status: "queued", userRowId: null }); await submitting;
    expect(f.runtime.store.get("a").messages.filter((message) => message.role === "user").map((message) => message.rowId)).toEqual([99]);
  });
});
