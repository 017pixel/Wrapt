import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workFixture } from "./test.fixture.js";
import { refreshBackground } from "../background-state.js";

describe("Worklifecycle, Reconnectabdeckung und verlorene Quittungen", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  it("eigene laufende Nebenaufgabe hält Runtime nach Hauptabschluss und Flagoff bis zur konkreten Completion", async () => {
    await f.client.run({ op: "work.background", sessionId: f.session.id, text: "Eigene Arbeit" });
    f.event("message.complete", { text: "Hauptturn beendet" });
    await expect.poll(() => f.client.manager.sessions.records.get(f.session.id)?.snapshot.running).toBe(false);
    const record = f.client.manager.sessions.records.get(f.session.id)!;
    expect(f.client.manager.work.state.active(record)).toBe(true);
    f.client.manager.release(f.client.id, "v2-disabled"); expect(f.client.manager.retainRuntime).toBe(true);
    f.event("background.complete", { task_id: "nebenaufgabe", text: "Fertig" });
    await expect.poll(() => f.client.manager.work.state.active(record)).toBe(false);
    expect(f.count("session.close")).toBe(0);
  });
  it("native aktive Kinder werden durch echten Roster gehalten, Verschwinden erfindet keinen abgeschlossenen Status", async () => {
    f.children.push({ subagent_id: "kind", status: "running" }); await f.read();
    expect(f.client.manager.sessions.records.get(f.session.id)?.backgroundActive).toBe(true);
    f.event("subagent.start", { subagent_id: "kind", goal: "Eigenes Kind" });
    await expect.poll(() => f.client.manager.work.state.active(f.client.manager.sessions.records.get(f.session.id)!)).toBe(true);
    f.children.length = 0; const roster = await f.read();
    expect(roster.subagents[0]?.status).toBe("running");
    f.event("subagent.complete", { subagent_id: "kind", status: "interrupted" });
    await expect.poll(() => f.client.manager.work.state.active(f.client.manager.sessions.records.get(f.session.id)!)).toBe(false);
    expect((await f.read()).subagents[0]?.status).toBe("interrupted");
  });
  it.each(["work.background", "work.btw"] as const)("verlorene echte %s-Quittung wird unknown ohne Retry", async (op) => {
    const method = op === "work.btw" ? "prompt.btw" : "prompt.background";
    f.core.dropReplies.add(method);
    expect(await f.client.run({ op, sessionId: f.session.id, text: "Eigener Auftrag" }))
      .toMatchObject({ type: "error", outcome: "unknown" });
    expect(f.count(method)).toBe(1); expect(f.client.manager.retainRuntime).toBe(true);
    expect(f.client.manager.work.state.get(f.client.manager.sessions.records.get(f.session.id)!).tasks.size).toBe(0);
  });
  it("Scopegeneration entfernt alte Roster-/Taskdaten, behält aber unbekannte laufende Arbeit geschützt", async () => {
    await f.client.run({ op: "work.btw", sessionId: f.session.id, text: "Eigenes Thema" });
    expect((await f.read()).tasks).toHaveLength(1);
    await f.selectHome(f.other); await f.selectHome(f.home);
    const roster = await f.read(); expect(roster.tasks).toEqual([]); expect(roster.coverage.tasks).toBe("observed-partial");
    expect(f.client.manager.work.state.active(f.client.manager.sessions.records.get(f.session.id)!)).toBe(true);
  });
  it("Abschluss ohne Erfolgsstatus belegt Settlement, ohne completed zu erfinden", async () => {
    f.event("subagent.start", { subagent_id: "kind" });
    await expect.poll(() => f.client.manager.work.state.active(f.client.manager.sessions.records.get(f.session.id)!)).toBe(true);
    f.event("subagent.complete", { subagent_id: "kind" });
    await expect.poll(() => f.client.manager.work.state.active(f.client.manager.sessions.records.get(f.session.id)!)).toBe(false);
    expect((await f.read()).subagents[0]?.status).toBeNull();
  });
  it("große Inhalte und viele Aufgaben bleiben begrenzt und markieren Kürzung", async () => {
    for (let n = 0; n < 110; n++) f.event("btw.complete", { task_id: `aufgabe-${n}`, text: "ä".repeat(20_000) });
    await expect.poll(() => f.client.manager.sessions.records.get(f.session.id)?.seq, { timeout: 5_000 }).toBe(f.session.seq);
    const roster = await f.read(); expect(roster.tasks.length).toBeLessThanOrEqual(100); expect(roster.coverage.truncated).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(roster))).toBeLessThan(f.client.manager.policy.browserBytes);
    expect(roster.tasks.every((row) => Buffer.byteLength(row.text ?? "") <= 16_384)).toBe(true);
  });
  it("beobachtete Prozesse eigener V2-Runtime überleben Flagoff bis frisch bestätigtem Settlement", async () => {
    const manager = f.client.manager; const record = manager.sessions.records.get(f.session.id)!;
    record.ownedBinding = { epoch: record.epoch, liveId: record.liveId! };
    f.processes.push({ session_id: "prozess", status: "running" }); await f.read();
    manager.release(f.client.id, "v2-disabled"); expect(manager.retainRuntime).toBe(true);
    f.processes.length = 0;
    await refreshBackground(manager.upstream, record, () => manager.work.state.active(record));
    expect(manager.retainRuntime).toBe(false); expect(f.count("process.stop")).toBe(0);
  });
});
