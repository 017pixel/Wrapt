import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workFixture } from "./test.fixture.js";

describe("Eigene native Workaktionen und tatsächliche Resultate", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  it.each([false, true])("sichtbares Kind erhält ehrliches Interruptresultat found=%s", async (found) => {
    f.children.push({ subagent_id: "kind", status: "running" }); f.interrupt(found);
    expect(await f.client.run({ op: "work.subagent.interrupt", sessionId: f.session.id, subagentId: "kind" }))
      .toMatchObject({ type: "result", data: { id: "kind", found } });
    expect(f.count("subagent.interrupt")).toBe(1);
    expect(f.core.calls.find((call) => call.method === "subagent.interrupt")?.params).toEqual({ session_id: f.session.liveId, subagent_id: "kind" });
  });
  it.each([false, true])("Tail behält available=%s und native Kürzung", async (available) => {
    f.children.push({ subagent_id: "kind" }); f.tail(available ? "ä".repeat(20_000) : "", available, available);
    const response = await f.client.run({ op: "work.subagent.tail", sessionId: f.session.id, subagentId: "kind" });
    expect(response).toMatchObject({ type: "result", data: { id: "kind", available, truncated: available } });
    if (response.type === "result" && response.op === "work.subagent.tail") expect(Buffer.byteLength(response.data.text)).toBeLessThanOrEqual(16_384);
  });
  it.each(["killed", "already_exited", "not_found", "error"] as const)("process.kill erhält %s ohne pauschalen Erfolg", async (status) => {
    f.processes.push({ session_id: "prozess", status: "running" });
    f.kill({ status, session_id: "prozess", exit_code: status === "already_exited" ? -9 : null, error: status === "error" ? "Konkreter Fehler" : null });
    expect(await f.client.run({ op: "work.process.kill", sessionId: f.session.id, processId: "prozess" }))
      .toMatchObject({ type: "result", data: { id: "prozess", status, exitCode: status === "already_exited" ? -9 : null } });
    expect(f.count("process.kill")).toBe(1); expect(f.count("process.stop")).toBe(0); expect(f.count("agents.list")).toBe(0);
  });
  it("globale oder nur historisch beobachtete Ziele werden durch frischen eigenen Roster abgewiesen", async () => {
    f.event("subagent.start", { subagent_id: "historisch" });
    await expect.poll(() => f.client.messages.some((frame) => frame.type === "event" && frame.event.type === "work.updated")).toBe(true);
    for (const subagentId of ["fremd", "historisch"])
      expect(await f.client.run({ op: "work.subagent.interrupt", sessionId: f.session.id, subagentId }))
        .toMatchObject({ type: "error", code: "FORBIDDEN", outcome: "not_sent" });
    expect(await f.client.run({ op: "work.subagent.tail", sessionId: f.session.id, subagentId: "fremd" }))
      .toMatchObject({ type: "error", code: "FORBIDDEN" });
    expect(await f.client.run({ op: "work.process.kill", sessionId: f.session.id, processId: f.session.id }))
      .toMatchObject({ type: "error", code: "FORBIDDEN" });
    expect(f.count("subagent.interrupt") + f.count("subagent.tail") + f.count("process.kill")).toBe(0);
  });
  it.each(["work.background", "work.btw"] as const)("%s Completion vor Receipt bleibt terminal und beendet den Hauptturn nicht", async (op) => {
    f.event("message.start", {});
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => {
      const value = hook(method, params, raw);
      if (method === (op === "work.btw" ? "prompt.btw" : "prompt.background"))
        f.event(op === "work.btw" ? "btw.complete" : "background.complete", { task_id: "nebenaufgabe", text: "Antwort" });
      return value;
    };
    expect(await f.client.run({ op, sessionId: f.session.id, text: "Eigene Anfrage" })).toMatchObject({ type: "result", data: { taskId: "nebenaufgabe" } });
    expect((await f.read()).tasks).toEqual([{ kind: op === "work.btw" ? "btw" : "background", id: "nebenaufgabe", status: "completed", text: "Antwort" }]);
    expect(f.client.manager.sessions.records.get(f.session.id)?.snapshot.running).toBe(true);
    expect(f.count(op === "work.btw" ? "prompt.btw" : "prompt.background")).toBe(1);
  });
  it("konkrete fremd gestartete Completion darf ohne erfundenen Start erscheinen, doppelte Completion ist stabil", async () => {
    f.event("btw.complete", { task_id: "echte-id", text: "Belegte Antwort" });
    await expect.poll(() => f.client.messages.some((frame) => frame.type === "event" && frame.event.type === "work.updated")).toBe(true);
    const first = await f.read(); f.event("btw.complete", { task_id: "echte-id", text: "Belegte Antwort" });
    await expect.poll(() => f.client.manager.sessions.records.get(f.session.id)?.seq).toBe(f.session.seq);
    expect((await f.read()).tasks).toEqual(first.tasks); expect(first.tasks[0]?.status).toBe("completed");
    expect(f.count("prompt.btw")).toBe(0);
  });
  it("Queue zeigt echten ersten Kopf, Submitreceipt und Steerrejected ersetzen ihn nicht", async () => {
    f.queue("Erste native Nachricht");
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => method === "prompt.submit" ? { status: "queued" }
      : method === "session.steer" ? { status: "rejected" } : hook(method, params, raw);
    expect(await f.client.run({ op: "message.submit", sessionId: f.session.id, text: "Zweite Nachricht", mode: "queue" }))
      .toMatchObject({ type: "result", data: { status: "queued" } });
    expect(f.core.calls.find((call) => call.method === "prompt.submit")?.params.queued).toBe(true);
    expect((await f.read()).queuedText).toBe("Erste native Nachricht");
    expect(await f.client.run({ op: "session.steer", sessionId: f.session.id, text: "Korrektur" }))
      .toMatchObject({ type: "result", data: { status: "rejected" } });
    expect((await f.read()).queuedText).toBe("Erste native Nachricht");
  });
  it("falsche Nativeantwort nach möglicher Annahme bleibt unknown ohne Wiederholung und hält Runtime", async () => {
    const hook = f.core.resultHook!;
    f.core.resultHook = (method, params, raw) => method === "prompt.background" ? {} : hook(method, params, raw);
    expect(await f.client.run({ op: "work.background", sessionId: f.session.id, text: "Eigener Auftrag" }))
      .toMatchObject({ type: "error", outcome: "unknown" });
    expect(f.count("prompt.background")).toBe(1); expect(f.client.manager.retainRuntime).toBe(true);
    expect(f.client.manager.work.state.active(f.client.manager.sessions.records.get(f.session.id)!)).toBe(true);
  });
});
