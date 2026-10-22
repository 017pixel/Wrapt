import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { workFixture } from "./test.fixture.js";

describe("M2 und L1: echte Snapshotbelege und Queuekopfkürzung", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  it("eigener Prozess aus regulärem Subscribe-Snapshot hält ohne work.read bis frischem Settlement", async () => {
    const created = await f.client.run({ op: "session.create", projectId: null });
    if (created.type !== "result" || created.op !== "session.create") throw new Error("Keine eigene Session");
    const id = created.data.snapshot.session.id; const manager = f.client.manager;
    f.processes.push({ session_id: "eigener-prozess", status: "running" });
    expect(await f.client.run({ op: "session.subscribe", sessionId: id })).toMatchObject({ type: "result" });
    const record = manager.sessions.records.get(id)!;
    expect(record.ownedBinding).not.toBeNull(); expect(record.backgroundActive).toBe(true); expect(record.backgroundProtected).toBe(true);
    expect(manager.work.state.get(record).observed).toBe(false);
    manager.release(f.client.id, "v2-disabled"); expect(manager.retainRuntime).toBe(true);
    await delay(25); expect(manager.sessions.records.has(id)).toBe(true); expect(f.core.server.clients.size).toBe(1);
    f.processes.length = 0; f.core.event(f.core.sessions.get(id)!, "message.complete", { text: "Neuer Abgleich" });
    await expect.poll(() => manager.sessions.records.size).toBe(0);
    await expect.poll(() => f.core.server.clients.size).toBe(0);
    expect(f.count("process.stop")).toBe(0);
  });
  it.each([200_000, 200_001])("Queuekopf von %d Zeichen kennzeichnet seine tatsächliche Begrenzung", async (length) => {
    f.queue("n".repeat(length)); const roster = await f.read();
    expect(roster.queuedText).toHaveLength(200_000); expect(roster.coverage.truncated).toBe(length > 200_000);
  });
});
