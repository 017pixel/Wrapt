import { afterEach, describe, expect, it } from "vitest";
import { clientMessage, securityFixture, type SecurityFixture } from "./security-test.fixture.js";

describe("Sitzungsgrenze zählt offene und geschützte Sitzungen", () => {
  let f: SecurityFixture;
  afterEach(async () => { await f.close(); });

  async function unsubscribe(id: string) {
    await f.manager.handle("tab", clientMessage({ op: "session.unsubscribe", sessionId: id }));
  }
  async function create() {
    await f.manager.handle("tab", clientMessage({ op: "session.create", projectId: null }));
  }

  it("gibt den Cache abgeschlossener abgemeldeter Sitzungen für neue Chats frei", async () => {
    f = await securityFixture({ maxSessions: 1 });
    const old = f.gateway.seed("completed");
    await f.manager.handle("tab", clientMessage({ op: "session.subscribe", sessionId: old.id }));
    await unsubscribe(old.id);
    await create();
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "session.create" });
    expect(f.manager.sessions.records.size).toBe(1);
    expect(f.manager.sessions.records.has(old.id)).toBe(false);
    expect(f.gateway.sessions.has(old.id)).toBe(true);
    expect(f.gateway.calls.some((call) => call.method === "session.interrupt")).toBe(false);
  });

  it.each(["running", "unknown", "background", "draft", "queued"] as const)("behält abgemeldete %s-Sitzungen geschützt", async (kind) => {
    f = await securityFixture({ maxSessions: 1 });
    if (kind === "draft") await create();
    else {
      const session = f.gateway.seed("protected");
      session.running = kind === "running";
      await f.manager.handle("tab", clientMessage({ op: "session.subscribe", sessionId: session.id }));
    }
    const record = [...f.manager.sessions.records.values()][0]!;
    if (kind === "unknown") record.backgroundActive = null;
    if (kind === "queued") record.snapshot.queuedText = "Wartender Auftrag";
    if (kind === "background") f.manager.work.state.update(record, { kind: "btw", id: "active-task", status: "running", text: null });
    await unsubscribe(record.storedId);
    await create();
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "RATE_LIMITED" });
    expect(f.manager.sessions.records.has(record.storedId)).toBe(true);
  });
});
