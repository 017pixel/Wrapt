import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workFixture } from "./test.fixture.js";

describe("Native Workroster und tatsächliche Legacyprojektion", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  it("trennt gleichlautende Kind-, Prozess-, Fehlerdelegations- und Nebenaufgabenkennungen", async () => {
    f.children.push({ subagent_id: "gleich", parent_id: "unbekannt", depth: 1, goal: "Echtes Ziel", status: "running", tool_count: 3 });
    f.processes.push({ session_id: "gleich", status: "running", exit_code: null });
    f.delegations.push(...[0, 1].map((task_index) => ({ delegation_id: "gleich", task_index, status: "failed", error: "Fehler" })));
    f.task("gleich");
    await f.client.run({ op: "work.background", sessionId: f.session.id, text: "Eigenes Ziel" });
    f.queue("Wirklicher Kopf"); const roster = await f.read();
    expect(roster.subagents[0]).toMatchObject({ kind: "subagent", id: "gleich", parentId: "unbekannt", toolCount: 3 });
    expect(roster.processes[0]).toMatchObject({ kind: "process", id: "gleich", command: null });
    expect(roster.delegations.map((row) => row.taskIndex)).toEqual([0, 1]);
    expect(roster.tasks[0]).toMatchObject({ kind: "background", id: "gleich", status: "running" });
    expect(roster.queuedText).toBe("Wirklicher Kopf");
    expect(roster.coverage).toMatchObject({ tasks: "observed-partial", delegations: "recent-failures-partial", queue: "next-only" });
  });
  it("native Listenkürzung und ungültige Zeilen bleiben als begrenzte unvollständige Sicht erkennbar", async () => {
    f.children.push(...Array.from({ length: 130 }, (_, n) => ({ subagent_id: `kind-${n}`, status: "running" })));
    f.processes.push({ command: "Ohne Identität" });
    const roster = await f.read(); expect(roster.subagents).toHaveLength(100); expect(roster.processes).toEqual([]);
    expect(roster.coverage.truncated).toBe(true);
  });
  it("partielle Toolereignisse löschen bestätigtes Ziel/Modell/Start/Count nicht und Tokens invalidieren keine Listen", async () => {
    f.event("subagent.start", { subagent_id: "kind", goal: "Ziel", model: "Modell", started_at: 1_800_000_000, tool_count: 2 });
    await expect.poll(() => f.client.messages.filter((row) => row.type === "event" && row.event.type === "work.updated").length).toBe(1);
    const calls = f.count("subagent.list"); f.client.messages.length = 0;
    f.event("subagent.tool", { subagent_id: "kind", tool_name: "terminal" });
    await expect.poll(() => f.client.messages.some((row) => row.type === "event" && row.event.type === "work.updated")).toBe(true);
    const frame = f.client.messages.find((row) => row.type === "event" && row.event.type === "work.updated");
    expect(frame).toMatchObject({ type: "event", event: { payload: { change: { kind: "subagent", id: "kind", lastTool: "terminal" } } } });
    if (frame?.type === "event" && frame.event.type === "work.updated") {
      expect(frame.event.payload.change).not.toHaveProperty("goal"); expect(frame.event.payload.change).not.toHaveProperty("status");
    }
    expect(f.client.messages.some((row) => row.type === "event" && row.event.type === "work.invalidated")).toBe(false);
    expect(f.count("subagent.list")).toBe(calls);
    expect((await f.read()).subagents[0]).toMatchObject({ goal: "Ziel", model: "Modell", startedAt: 1_800_000_000_000, toolCount: 2, lastTool: "terminal" });
  });
  it("ältere Verbindungen erhalten tatsächlich keine neuen Events und subagents.read behält seine exakte Struktur", async () => {
    const old = f.browser("a", false); await old.run({ op: "session.subscribe", sessionId: f.session.id });
    f.children.push({ subagent_id: "kind", status: "running" }); old.messages.length = 0;
    f.event("subagent.start", { subagent_id: "kind", goal: "Ziel" });
    await expect.poll(() => f.client.messages.some((row) => row.type === "event" && row.event.type === "work.updated")).toBe(true);
    expect(old.messages.some((row) => row.type === "event" && row.event.type.startsWith("work."))).toBe(false);
    expect(await old.run({ op: "work.read", sessionId: f.session.id })).toMatchObject({ type: "error", code: "FORBIDDEN", outcome: "not_sent" });
    const reply = await old.run({ op: "subagents.read", sessionId: f.session.id });
    expect(reply.type === "result" && reply.op === "subagents.read" && Object.keys(reply.data).sort()).toEqual(["background", "subagents"]);
  });
  it("Secrets werden ausschließlich in Workanzeigefeldern maskiert, IDs bleiben exakt", async () => {
    f.client.manager.secrets.remember("eigenes-testgeheimnis");
    f.children.push({ subagent_id: "eigenes-testgeheimnis", goal: "eigenes-testgeheimnis", model: "eigenes-testgeheimnis" });
    f.processes.push({ session_id: "prozess", output_tail: "eigenes-testgeheimnis", command: "eigenes-testgeheimnis" });
    const roster = await f.read(); expect(roster.subagents[0]?.id).toBe("eigenes-testgeheimnis");
    expect(roster.subagents[0]?.goal).not.toContain("eigenes-testgeheimnis"); expect(roster.subagents[0]?.model).not.toContain("eigenes-testgeheimnis");
    expect(roster.processes[0]?.output).not.toContain("eigenes-testgeheimnis");
  });
  it("unbekannte Eltern und Zyklen bleiben begrenzte Daten ohne rekursive Autorisierung", async () => {
    f.children.push({ subagent_id: "a", parent_id: "b", status: "running" }, { subagent_id: "b", parent_id: "a", status: "running" },
      { subagent_id: "c", parent_id: "fehlt", status: "running" });
    const roster = await f.read(); expect(roster.subagents.map((row) => row.parentId)).toEqual(["b", "a", "fehlt"]);
    expect(f.count("subagent.interrupt")).toBe(0);
  });
  it("fehlende Kindidentität markiert unvollständige Sicht statt erfundener Zeile oder Settlement", async () => {
    f.event("subagent.spawn_requested", { goal: "Unvollständiges natives Ereignis", task_count: 1 });
    await expect.poll(() => f.client.messages.some((frame) => frame.type === "event" && frame.event.type === "work.invalidated")).toBe(true);
    const roster = await f.read(); expect(roster.subagents).toEqual([]); expect(roster.coverage.truncated).toBe(true);
    expect(f.client.manager.work.state.active(f.client.manager.sessions.records.get(f.session.id)!)).toBe(true);
  });
  it("native Fehlerdelegation beendet den konkret belegten flachen Auftrag; verspäteter Patch setzt ihn nicht running", async () => {
    f.event("subagent.start", { delegation_id: "delegation", task_index: 1, goal: "Eigenes Ziel" });
    const record = f.client.manager.sessions.records.get(f.session.id)!;
    await expect.poll(() => f.client.manager.work.state.active(record)).toBe(true);
    f.delegations.push({ delegation_id: "delegation", task_index: 1, status: "failed", goal: "Eigenes Ziel", error: "Fehler" });
    expect((await f.read()).delegations[0]?.status).toBe("failed"); expect(f.client.manager.work.state.active(record)).toBe(false);
    f.client.messages.length = 0; f.event("subagent.start", { delegation_id: "delegation", task_index: 1, goal: "Präzisiertes Ziel" });
    await expect.poll(() => f.client.messages.some((frame) => frame.type === "event" && frame.event.type === "work.updated")).toBe(true);
    const changed = f.client.messages.find((frame) => frame.type === "event" && frame.event.type === "work.updated");
    expect(changed).toMatchObject({ event: { payload: { change: { kind: "delegation", status: "failed" } } } });
  });
  it("auch gekürzte Felder einzelner Zeilen tragen ein ehrliches Kürzungsmerkmal", async () => {
    f.children.push({ subagent_id: "kind", goal: "x".repeat(10_001) });
    const roster = await f.read(); expect(roster.subagents[0]?.goal).toHaveLength(10_000); expect(roster.coverage.truncated).toBe(true);
  });
});
