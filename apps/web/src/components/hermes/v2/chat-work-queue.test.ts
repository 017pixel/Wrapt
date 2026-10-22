import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage } from "@wrapt/contracts/hermes-v2";
import { event, settle, snapshot } from "./chat-test-fixtures";
import { workFixture, workRoster, type WorkFixture } from "./chat-work-test-fixtures";

describe("Native Queue, Steer und Nebenaufgaben", () => {
  let f: WorkFixture;
  beforeEach(async () => { vi.useFakeTimers(); f = await workFixture(); });
  afterEach(() => { f.cleanup(); vi.useRealTimers(); });
  it("ersetzt den nativen ersten Kopf durch mehrere Quittungen niemals mit der zweiten Nachricht", async () => {
    f.setRoster(workRoster({ queuedText: "Echter erster Kopf" })); await f.actions.refreshWork();
    await f.actions.submit("Zweiter Eintrag", "queue"); await f.actions.submit("Dritter Eintrag", "queue");
    expect(f.runtime.store.get("a").queuedText).toBe("Echter erster Kopf");
    expect(f.view().queue).toEqual({ head: "Echter erster Kopf", observed: true });
    expect(f.view().actions.map((row) => [row.text, row.status, row.result?.kind])).toEqual([["Zweiter Eintrag", "confirmed", "queue"], ["Dritter Eintrag", "confirmed", "queue"]]);
    expect(f.gateway.sent.filter((frame) => frame.op === "message.submit").map((frame) => frame.mode)).toEqual(["queue", "queue"]);
    await vi.advanceTimersByTimeAsync(200); expect(f.view().queue.head).toBe("Echter erster Kopf");
  });
  it("erfindet aus einer queued-Quittung ohne Read keinen bekannten Kopf", async () => {
    f.setHandler((frame) => frame.op === "work.read");
    await f.actions.submit("Quittung ist kein Kopf", "queue");
    expect(f.view().queue.head).toBeNull(); expect(f.runtime.store.get("a").queuedText).toBeNull();
    expect(f.view().actions.at(-1)?.result).toMatchObject({ kind: "queue", status: "queued" });
  });
  it("führt gleiche offene Queueklicks ohne weiteren Send zusammen und erlaubt später bewusst erneut", async () => {
    let held: HermesV2ClientMessage | undefined;
    f.setHandler((frame) => { if (frame.op === "message.submit") { held = frame; return true; } return false; });
    const first = f.actions.submit("Eintrag", "queue"), second = f.actions.submit("Eintrag", "queue"); await settle();
    expect(f.gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(1);
    f.gateway.socket.result(held!, { status: "queued", userRowId: null }); await Promise.all([first, second]);
    f.setHandler(null); await f.actions.submit("Eintrag", "queue");
    expect(f.gateway.sent.filter((frame) => frame.op === "message.submit")).toHaveLength(2);
  });
  it("übernimmt einen neuen nativen Kopf ausschließlich durch work.read oder Snapshot", async () => {
    f.setRoster(workRoster({ revision: 1, queuedText: "Readkopf" })); await f.actions.refreshWork();
    expect(f.view().queue).toEqual({ head: "Readkopf", observed: true });
    f.gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { queuedText: "Snapshotkopf" }) });
    expect(f.view().queue).toEqual({ head: "Snapshotkopf", observed: true });
  });
  it.each(["queued", "redirected", "rejected"] as const)("erhält den tatsächlichen Steerstatus %s", async (status) => {
    f.setHandler((frame, socket) => { if (frame.op !== "session.steer") return false; socket.result(frame, { status }); return true; });
    await f.actions.steer("Neue Richtung");
    expect(f.view().actions.at(-1)).toMatchObject({ action: "steer", status: "confirmed", result: { kind: "steer", status } });
    expect(f.view().queue.head).toBeNull();
  });
  it("weist einen ungültigen Steerstatus nach Send als unknown aus", async () => {
    f.setHandler((frame, socket) => { if (frame.op !== "session.steer") return false;
      socket.raw(JSON.stringify({ v: 1, type: "result", id: frame.id, op: frame.op, data: { status: "sent" } })); return true; });
    await f.actions.steer("Richtung");
    expect(f.view().actions.at(-1)).toMatchObject({ status: "unknown", error: { outcome: "unknown" } });
  });
  it.each(["background", "btw"] as const)("bewahrt %s-Completion vor Startquittung ohne Running-Downgrade", async (kind) => {
    let held: HermesV2ClientMessage | undefined;
    f.setHandler((frame) => { if (frame.op === `work.${kind}`) { held = frame; return true; } return false; });
    f.gateway.socket.event(event("message.started", 1, { turnId: "main" }));
    const action = kind === "background" ? f.actions.startBackground("Auftrag") : f.actions.startBtw("Auftrag"); await settle();
    expect(f.view().tasks).toEqual([]); expect(f.view().actions.at(-1)?.status).toBe("pending");
    f.gateway.socket.event(event("work.updated", 2, { revision: 1, change: { kind, id: "early-task", status: "completed", text: "Früh fertig" } }));
    f.gateway.socket.result(held!, { kind, taskId: "early-task" }); await action;
    expect(f.view().tasks).toHaveLength(1); expect(f.view().tasks[0]).toMatchObject({ kind, id: "early-task", status: "completed", text: "Früh fertig" });
    expect(f.runtime.store.get("a").running).toBe(true); expect(f.view().actions.at(-1)?.result).toEqual({ kind, taskId: "early-task" });
  });
  it("trennt gleichlautende Background-/Btw-ID und korreliert nur den konkreten Abschluss", async () => {
    await f.actions.startBackground("eins"); await f.actions.startBtw("zwei");
    f.gateway.socket.event(event("work.updated", 1, { revision: 1, change: { kind: "btw", id: "task", status: "completed", text: "Btw fertig" } }));
    expect(f.view().tasks.map((row) => [row.kind, row.id, row.status])).toEqual([["background", "task", "running"], ["btw", "task", "completed"]]);
  });
  it("zeigt einen konkreten fremden Abschluss, ohne einen fehlenden Start zu erfinden", () => {
    f.gateway.socket.event(event("work.updated", 1, { revision: 1, change: { kind: "background", id: "external", status: "completed", text: "Ergebnis" } }));
    expect(f.view().tasks[0]).toMatchObject({ id: "external", status: "completed" });
    expect(f.view().actions).toEqual([]);
  });
  it("macht eine invalidierte Queueprojektion bis zum bewussten Read als unbekannt kenntlich", async () => {
    f.setRoster(workRoster({ revision: 2, queuedText: "Kopf" })); await f.actions.refreshWork();
    f.gateway.socket.event(event("work.invalidated", 1, { revision: 3, reason: "queue" }));
    expect(f.view().queue).toEqual({ head: "Kopf", observed: false });
    f.setRoster(workRoster({ revision: 3 })); await f.actions.refreshWork();
    expect(f.view().queue).toEqual({ head: null, observed: true });
  });
});
