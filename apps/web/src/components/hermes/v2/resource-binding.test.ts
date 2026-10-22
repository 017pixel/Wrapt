import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cronJob, heldResource, jsonResource, resourceFixture, resourceScope, settleResources, type ResourceFixture } from "./resource-test-fixtures";

describe("Monotone tatsächlich beobachtete Ressourcenbindung", () => {
  let f: ResourceFixture;
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => { f?.cleanup(); await settleResources(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  const online = (id: string, epoch = "epoch") => f.gateway.socket.receive({ v: 1, type: "connection", state: "online", epoch, connectionId: id });
  it("erhält identische wiederholte Bindungen ohne Abort, Generation oder zusätzlichen Read", async () => {
    f = await resourceFixture();
    const held = heldResource<Response>(); let signal: AbortSignal | undefined;
    f.setHandler((request) => { if (request.path === "cron/jobs") { signal = request.signal; return held.promise; } });
    const before = f.requests.length, generation = f.view().generation;
    const read = f.actions.refresh(); await settleResources();
    online(f.gateway.socket.connectionId); online(f.gateway.socket.connectionId);
    expect(signal?.aborted).toBe(false); expect(f.view().generation).toBe(generation);
    held.resolve(jsonResource({ scope: resourceScope, jobs: [cronJob("current")], truncated: false })); await read;
    expect(f.requests.length - before).toBe(1); expect(f.view().cron.list.data?.jobs[0]?.id).toBe("current");
  });
  it.each(["id", "epoch", "aba"])("beendet alte Reads bei %s-Wechsel und lädt den aktuellen Stand ohne neuen Socket", async (kind) => {
    f = await resourceFixture();
    const held = heldResource<Response>(); let first = true, signal: AbortSignal | undefined;
    f.setHandler((request) => { if (request.path === "cron/jobs" && first) { first = false; signal = request.signal; return held.promise; } });
    const generation = f.view().generation;
    const read = f.actions.refresh(); await settleResources();
    if (kind === "epoch") online(f.gateway.socket.connectionId, "new-epoch");
    else online(crypto.randomUUID());
    if (kind === "aba") online(f.gateway.socket.connectionId);
    await settleResources(); expect(signal?.aborted).toBe(true);
    expect(f.view().generation).toBeGreaterThan(generation); expect(f.view().cron.list.status).toBe("ready");
    held.resolve(jsonResource({ scope: resourceScope, jobs: [cronJob("old-binding")], truncated: false })); await read;
    expect(f.view().cron.list.data?.jobs.some((job) => job.id === "old-binding")).toBe(false);
    expect(f.gateway.sockets).toHaveLength(1);
  });
  it("finalisiert gehaltenen mutierenden Send nach Bindungs-A-B-A unknown ohne Retry", async () => {
    f = await resourceFixture();
    const held = heldResource<Response>();
    f.setHandler((request) => request.method !== "GET" ? held.promise : undefined);
    const action = f.actions.pauseCron("job-a"); await settleResources();
    online(crypto.randomUUID()); online(f.gateway.socket.connectionId); await action;
    held.resolve(jsonResource({ scope: resourceScope, operation: "pause", outcome: "confirmed", jobId: "job-a", job: cronJob() })); await settleResources();
    expect(f.view().actions.at(-1)).toMatchObject({ status: "unknown", result: null, reconciled: false });
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(1);
    expect(f.gateway.sockets).toHaveLength(1);
  });
});
