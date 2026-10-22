import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";
import { captureDeleteCleanup } from "./delete-cleanup.js";

describe("Deletecleanup erhält neue lokale Sitzungsbelege", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  const id = "delete-generation-session";
  beforeEach(async () => {
    f = await resourceFixture(); f.stored.set(id, { id, profile: "default", cwd: f.root, title: "Test", started_at: 1_700_000_000 }); f.core.seed(id);
  });
  afterEach(async () => { await f.close(); });
  async function subscribed() {
    const browser = f.browser();
    await browser.manager.handle(browser.id, { v: 1, id: randomUUID(), op: "session.subscribe", sessionId: id });
    return { ...browser, record: browser.manager.sessions.records.get(id)! };
  }
  it.each([false, true])("erhält echte neue Hydrierung nach DELETE, gepufferter Start=%s", async (working) => {
    const browser = await subscribed(); const { record, manager } = browser; const native = f.core.sessions.get(id)!;
    const preview = await f.request("GET", `/sessions/${id}/deletion`); expect(preview.json().deletable).toBe(true);
    let sent = false; let started = false; let held = false; let release!: () => void; let pending: Promise<void> | undefined;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    f.hook(async (method, path) => {
      if (method === "DELETE") sent = true;
      if (sent && !started && path === "/api/profiles/active") {
        started = true; pending = manager.handle(browser.id, { v: 1, id: randomUUID(), op: "session.subscribe", sessionId: id });
        await expect.poll(() => held).toBe(true); expect(record.hydrating).toBe(true);
        if (working) { native.running = true; f.core.event(native, "message.start", {}); await expect.poll(() => record.buffered.length).toBeGreaterThan(0); }
      }
      if (started && !held && method === "GET" && new URL(path, "http://fake").pathname === `/api/sessions/${id}`) { held = true; await barrier; }
    });
    const lease = manager.subscriptions.get(browser.id, id);
    try {
      const result = await f.request("DELETE", `/sessions/${id}`, { scope: preview.json().scope, confirm: "delete-compression-chain" });
      expect(result.statusCode).toBe(200); expect(f.writes).toHaveLength(1);
      expect(manager.sessions.records.get(id)).toBe(record); expect(record.subscribers.has(browser.id)).toBe(true);
      expect(manager.subscriptions.get(browser.id, id)).toBe(lease); expect(record.hydrating).toBe(true);
      if (working) expect(record.buffered.length).toBeGreaterThan(0);
      expect(f.core.calls.some((call) => ["session.interrupt", "session.close"].includes(call.method))).toBe(false);
    } finally { release(); await pending; }
  });
  it.each(["hydration", "context", "snapshot", "requests", "queue", "buffer", "protected", "replacement", "epoch", "subscriber"])("erhält die nach Send geänderte Bindung: %s", async (change) => {
    const { manager, record, id: connection } = await subscribed();
    const cleanup = captureDeleteCleanup(f.pool.resources!, "default", id);
    if (change === "hydration") record.hydrationRevision = (record.hydrationRevision ?? 0) + 1;
    if (change === "context") record.contextRevision = (record.contextRevision ?? 0) + 1;
    if (change === "snapshot") record.snapshot = { ...record.snapshot };
    if (change === "requests") record.snapshot.requests = [];
    if (change === "queue") record.snapshot.queuedText = "Neue Eingabe";
    if (change === "buffer") { record.buffered.push({ seq: record.seq + 1, type: "message.start", payload: {} }); record.bufferedBytes = 1; }
    if (change === "protected") record.backgroundProtected = true;
    if (change === "replacement") manager.sessions.records.set(id, { ...record });
    if (change === "epoch") record.epoch = "new-epoch";
    if (change === "subscriber") record.subscribers.add("new-subscriber");
    const current = manager.sessions.records.get(id); cleanup();
    expect(manager.sessions.records.get(id)).toBe(current); expect(record.subscribers.has(connection)).toBe(true);
    expect(manager.subscriptions.get(connection, id)).toBeDefined();
  });
  it("bereinigt weiterhin genau den unveränderten inaktiven Record samt Lease", async () => {
    const { manager, record, id: connection } = await subscribed();
    captureDeleteCleanup(f.pool.resources!, "default", id)();
    expect(manager.sessions.records.has(id)).toBe(false); expect(record.subscribers.size).toBe(0);
    expect(manager.subscriptions.get(connection, id)).toBeUndefined();
  });
});
