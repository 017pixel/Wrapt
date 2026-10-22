import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2ClientMessage, HermesV2WorkPatch } from "@wrapt/contracts/hermes-v2";
import { event, settle, snapshot } from "./chat-test-fixtures";
import { workFixture, workRoster, workOwner, type WorkFixture } from "./chat-work-test-fixtures";
import { chatPolicy } from "./chat-policy";

type Kind = "background" | "btw";
describe("Abschlussbelege offener Starts außerhalb des sichtbaren Rosters", () => {
  let f: WorkFixture, seq: number;
  beforeEach(async () => { vi.useFakeTimers(); f = await workFixture(); seq = 0; });
  afterEach(async () => { f.cleanup(); await settle(); vi.useRealTimers(); });
  const patch = (change: HermesV2WorkPatch, sessionId = "a") => f.gateway.socket.event(event("work.updated", ++seq, { revision: seq, change }, sessionId));
  const complete = (kind: Kind, id: string, sessionId = "a") => patch({ kind, id, status: "completed", text: "Belegter Abschluss" }, sessionId);
  const noise = (kind: Kind, count: number, prefix = "other") => { for (let index = 0; index < count; index++) complete(kind, `${prefix}${index}`); };
  const start = (kind: Kind, text = "Auftrag") => kind === "background" ? f.actions.startBackground(text) : f.actions.startBtw(text);
  const blockReads = (frame: HermesV2ClientMessage) => {
    if (frame.op !== "work.read") return false;
    f.gateway.socket.receive({ v: 1, type: "error", id: frame.id, code: "STALE_REQUEST", message: "Alter Read", outcome: "not_sent", retryable: true }); return true;
  };
  for (const kind of ["background", "btw"] as const) {
    it.each([99, 100, 130])(`${kind}: %i weitere Abschlüsse machen den eigenen Task nicht wieder aktiv`, async (count) => {
      let held!: HermesV2ClientMessage;
      f.setHandler((frame) => { if (blockReads(frame)) return true; if (frame.op !== `work.${kind}`) return false; held = frame; return true; });
      f.gateway.socket.event(event("message.started", ++seq, { turnId: "main" }));
      const request = start(kind); await settle(); complete(kind, "own-done"); noise(kind, count);
      f.gateway.socket.result(held, { kind, taskId: "own-done" }); await request;
      expect(f.view().actions.at(-1)).toMatchObject({ status: "confirmed", result: { kind, taskId: "own-done" } });
      expect(f.view().tasks.find((task) => task.kind === kind && task.id === "own-done")?.status).toBe("completed");
      expect(f.view().counts.tasks).toBe(0); expect(f.view().tasks.length).toBeLessThanOrEqual(100);
      expect(f.runtime.store.get("a").running).toBe(true);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(f.view().tasks.find((task) => task.id === "own-done")?.status).not.toBe("running");
      expect(f.gateway.sent.filter((frame) => frame.op === `work.${kind}`)).toHaveLength(1);
    });
    it(`${kind}: unbekannte ID nach vollem Evidenzbudget bleibt ohne erfundene Aktivität`, async () => {
      let held!: HermesV2ClientMessage;
      f.setHandler((frame) => { if (blockReads(frame)) return true; if (frame.op !== `work.${kind}`) return false; held = frame; return true; });
      const request = start(kind); await settle(); noise(kind, 130, "before"); complete(kind, "late-done"); noise(kind, 130, "after");
      f.gateway.socket.result(held, { kind, taskId: "late-done" }); await request;
      expect(f.view().actions.at(-1)).toMatchObject({ status: "confirmed", result: { kind, taskId: "late-done" } });
      expect(f.view().tasks.some((task) => task.status === "running")).toBe(false); expect(f.view().counts.tasks).toBeNull();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(f.view().counts.tasks).toBeNull(); expect(f.gateway.sent.filter((frame) => frame.op === `work.${kind}`)).toHaveLength(1);
      f.setHandler(null); f.setRoster(workRoster({ revision: seq + 1, tasks: [] })); await f.actions.refreshWork();
      expect(f.view().tasks).toEqual([]); expect(f.view().counts.tasks).toBe(0);
    });
  }
  it("reserviert den Beleg vor synchronen Completionevents im eigentlichen Socket-Send", async () => {
    f.setHandler((frame, socket) => {
      if (frame.op !== "work.background") return false;
      complete("background", "synchronous"); noise("background", 130);
      socket.result(frame, { kind: "background", taskId: "synchronous" }); return true;
    });
    await f.actions.startBackground("Schnell");
    expect(f.view().tasks.find((task) => task.id === "synchronous")?.status).toBe("completed");
    expect(f.view().counts.tasks).toBe(0);
  });
  it("korreliert mehrere offene Starts bei umgekehrten Receipts separat", async () => {
    const held: HermesV2ClientMessage[] = [];
    f.setHandler((frame) => { if (frame.op !== "work.background") return false; held.push(frame); return true; });
    const requests = [start("background", "eins"), start("background", "zwei"), start("background", "drei")]; await settle();
    for (let index = 0; index < 3; index++) complete("background", `own${index}`);
    noise("background", 130);
    for (let index = 2; index >= 0; index--) f.gateway.socket.result(held[index]!, { kind: "background", taskId: `own${index}` });
    await Promise.all(requests);
    expect(f.view().actions.every((action) => action.status === "confirmed")).toBe(true);
    for (let index = 0; index < 3; index++) expect(f.view().tasks.find((task) => task.id === `own${index}`)?.status).toBe("completed");
    expect(f.view().counts.tasks).toBe(0);
  });
  it("vermischt gleiche Background-/Btw-IDs weder als Abschluss noch beim Evidenzbudget", async () => {
    const held: HermesV2ClientMessage[] = [];
    f.setHandler((frame) => { if (frame.op !== "work.background" && frame.op !== "work.btw") return false; held.push(frame); return true; });
    const background = start("background"), btw = start("btw"); await settle(); complete("background", "same"); noise("background", 130);
    f.gateway.socket.result(held[0]!, { kind: "background", taskId: "same" });
    f.gateway.socket.result(held[1]!, { kind: "btw", taskId: "same" }); await Promise.all([background, btw]);
    expect(f.view().tasks.find((task) => task.kind === "background" && task.id === "same")?.status).toBe("completed");
    expect(f.view().tasks.find((task) => task.kind === "btw" && task.id === "same")?.status).toBe("running");
    expect(f.view().counts.tasks).toBe(1);
  });
  it("merkt vollständige gelesene Abschlüsse auch nach späterem Rosterersatz", async () => {
    let held!: HermesV2ClientMessage;
    f.setHandler((frame) => { if (frame.op !== "work.background") return false; held = frame; return true; });
    const request = start("background"); await settle();
    f.setRoster(workRoster({ revision: 1, tasks: [{ kind: "background", id: "read-done", status: "completed", text: "Fertig" }] })); await f.actions.refreshWork();
    f.setRoster(workRoster({ revision: 2, tasks: [] })); await f.actions.refreshWork();
    f.gateway.socket.result(held, { kind: "background", taskId: "read-done" }); await request;
    expect(f.view().tasks.find((task) => task.id === "read-done")?.status).toBe("completed");
    f.setRoster(workRoster({ revision: 3, tasks: [] })); await f.actions.refreshWork();
    expect(f.view().tasks).toEqual([]);
  });
  it("grenzt Completionwissen nach Sitzung ab", async () => {
    f.runtime.acquire(workOwner("b", "other-owner")); await settle();
    let held!: HermesV2ClientMessage;
    f.setHandler((frame) => { if (frame.op !== "work.background") return false; held = frame; return true; });
    const request = start("background"); await settle(); complete("background", "shared", "b");
    f.gateway.socket.result(held, { kind: "background", taskId: "shared" }); await request;
    expect(f.view().tasks.find((task) => task.id === "shared")?.status).toBe("running");
  });
  it("übernimmt vom Reducer verworfene ältere Workrevisionen nicht als Receiptbeleg", async () => {
    let held!: HermesV2ClientMessage;
    f.setHandler((frame) => { if (frame.op !== "work.background") return false; held = frame; return true; });
    const request = start("background"); await settle();
    f.setRoster(workRoster({ revision: 100, tasks: [] })); await f.actions.refreshWork();
    f.gateway.socket.event(event("work.updated", ++seq, { revision: 99, change: { kind: "background", id: "ignored", status: "completed" } }));
    f.gateway.socket.result(held, { kind: "background", taskId: "ignored" }); await request;
    expect(f.view().tasks.find((task) => task.id === "ignored")?.status).toBe("running");
  });
  it.each(["not_sent", "timeout"] as const)("gibt Marker nach %s frei, auch nach mehr als dem globalen Markerlimit", async (mode) => {
    f.setHandler((frame, socket) => {
      if (frame.op !== "work.background") return false;
      if (mode === "not_sent") socket.receive({ v: 1, type: "error", id: frame.id, code: "OPERATION_FAILED", message: "Nicht angenommen", outcome: "not_sent", retryable: false });
      return true;
    });
    const count = chatPolicy.maxPending + 2;
    for (let index = 0; index < count; index++) {
      const request = start("background", `Versuch${index}`); await settle();
      if (mode === "timeout") await vi.advanceTimersByTimeAsync(chatPolicy.rpcTimeoutMs);
      await request;
    }
    expect(f.gateway.sent.filter((frame) => frame.op === "work.background")).toHaveLength(count);
    expect(f.view().actions.at(-1)?.status).toBe(mode === "timeout" ? "unknown" : "not_sent");
    f.setHandler(null); await start("background", "Neuer bewusster Klick");
    expect(f.view().actions.at(-1)?.status).toBe("confirmed");
  });
  it("übernimmt gesicherten alten Abschluss nach CWD-A→B→A nicht in den neuen Kontext", async () => {
    let held!: HermesV2ClientMessage;
    f.setHandler((frame) => { if (frame.op !== "work.background") return false; held = frame; return true; });
    const request = start("background"); await settle(); complete("background", "old"); noise("background", 100);
    for (const cwd of ["/other", null]) f.gateway.socket.event(event("session.updated", ++seq, { session: { ...snapshot().session, cwd }, selection: null, turnStartedAt: null }));
    f.gateway.socket.result(held, { kind: "background", taskId: "old" }); await request;
    expect(f.view().actions.at(-1)?.status).toBe("unknown"); expect(f.view().tasks.some((task) => task.id === "old")).toBe(false);
  });
});
