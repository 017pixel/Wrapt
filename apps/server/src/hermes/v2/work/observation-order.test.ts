import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { refreshBackground } from "../background-state.js";
import { deferred } from "../attachments/await-context.fixture.js";
import { workFixture, resultData } from "./test.fixture.js";

describe("R2-M1: gemeinsame Reihenfolge nativer Work- und Lifecyclebelege", () => {
  let f: Awaited<ReturnType<typeof workFixture>>;
  beforeEach(async () => { f = await workFixture(); });
  afterEach(async () => { await f.close(); });
  function holdProcessReply() {
    const entered = deferred(); const socket = [...f.core.server.clients][0]!; const send = socket.send;
    let held = false; let release = () => {};
    socket.send = function (raw, ...args) {
      if (!held && JSON.parse(String(raw)).result !== undefined && f.core.calls.at(-1)?.method === "process.list") {
        held = true; release = () => { Reflect.apply(send, socket, [raw, ...args]); }; entered.resolve(); return;
      }
      return Reflect.apply(send, socket, [raw, ...args]);
    } as typeof send;
    return { entered: entered.promise, release: () => release(), restore: () => { socket.send = send; } };
  }
  async function ownSession() {
    const created = await f.client.run({ op: "session.create", projectId: null });
    if (created.type !== "result" || created.op !== "session.create") throw new Error("Create fehlt");
    const id = created.data.snapshot.session.id;
    expect(await f.client.run({ op: "session.subscribe", sessionId: id })).toMatchObject({ type: "result" });
    return { id, record: f.client.manager.sessions.records.get(id)! };
  }
  it.each([false, true])("späte Lifecycleantwort überschreibt keinen jüngeren Workbeleg, laufend=%s", async (running) => {
    const { id, record } = await ownSession(); const manager = f.client.manager;
    if (!running) f.processes.push({ session_id: "alter-prozess", status: "running" });
    const gate = holdProcessReply();
    const old = refreshBackground(manager.upstream, record, () => manager.work.state.active(record));
    try {
      await gate.entered; f.processes.length = 0;
      if (running) f.processes.push({ session_id: "neuer-prozess", status: "running" });
      const roster = resultData(await f.client.run({ op: "work.read", sessionId: id }));
      expect(roster.processes.map((row) => row.id)).toEqual(running ? ["neuer-prozess"] : []);
      gate.release(); gate.restore(); await old;
      expect(record.backgroundProtected).toBe(running); expect(record.backgroundActive).toBe(running);
      manager.release(f.client.id, "v2-disabled"); expect(manager.retainRuntime).toBe(running);
      if (running) {
        await delay(25); expect(manager.sessions.records.has(id)).toBe(true); expect(f.core.server.clients.size).toBe(1);
        f.processes.length = 0;
        f.core.event(f.core.sessions.get(id)!, "message.complete", { text: "Frisches Settlement" });
      }
      await expect.poll(() => manager.sessions.records.size).toBe(0);
      await expect.poll(() => f.core.server.clients.size).toBe(0);
      expect(f.count("process.stop")).toBe(0);
    } finally { gate.release(); gate.restore(); }
  });
  it("auch ein älterer Workread darf einen jüngeren positiven Lifecyclebeleg nicht löschen", async () => {
    const { id, record } = await ownSession(); const manager = f.client.manager;
    const gate = holdProcessReply(); const old = f.client.run({ op: "work.read", sessionId: id });
    try {
      await gate.entered; f.processes.push({ session_id: "frischer-prozess", status: "running" });
      await refreshBackground(manager.upstream, record, () => manager.work.state.active(record));
      gate.release(); gate.restore(); expect((await old).type).toBe("result");
      expect(record.backgroundProtected).toBe(true); expect(record.backgroundActive).toBe(true);
      f.processes.length = 0; await refreshBackground(manager.upstream, record, () => manager.work.state.active(record));
      expect(record.backgroundProtected).toBe(false); expect(record.backgroundActive).toBe(false);
    } finally { gate.release(); gate.restore(); }
  });
});
