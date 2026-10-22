import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resourcePolicy } from "./resource-policy";
import { cronFields, cronJob, heldResource, jsonResource, resourceFixture, resourceRejection,
  resourceScope, settleResources, type ResourceFixture } from "./resource-test-fixtures";

describe("Bewusste Abgleiche über mehrere unbekannte Aktionszyklen", () => {
  let f: ResourceFixture;
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => { f?.cleanup(); await settleResources(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  const writes = () => f.requests.filter((request) => request.method !== "GET");
  const maps = () => f.runtime.reads as unknown as { fresh: Map<string, unknown>; open: Map<string, unknown> };
  async function firstCycle() {
    f = await resourceFixture(); await f.select();
    f.setHandler((request) => request.method !== "GET" ? new Response("Quittung verloren") : undefined);
    await f.actions.pauseCron("job-a"); const key = f.view().actions.at(-1)!.key;
    await f.actions.reconcileAction(key);
    expect(f.view().actions.at(-1)?.reconciled).toBe(true);
    return key;
  }
  it.each(["valid", "error", "wrong-target", "missing"])("ein alter bewusster Read entsperrt keinen späteren Write, neuer Read=%s", async (outcome) => {
    const firstKey = await firstCycle();
    const old = heldResource<Response>(), fresh = heldResource<Response>(); let reads = 0;
    const beforeWrite = cronJob("job-a", { name: "Vor zweitem Write" });
    f.setHandler((request) => {
      if (request.method !== "GET") { f.jobs.set("job-a", cronJob("job-a", { name: "Tatsächliche zweite Wirkung" })); return new Response("Quittung verloren"); }
      if (request.path === "cron/jobs/job-a") return ++reads === 1 ? old.promise : fresh.promise;
    });
    const oldReconcile = f.actions.reconcileAction(firstKey); await settleResources();
    expect(reads).toBe(1);
    await f.actions.pauseCron("job-a"); const secondKey = f.view().actions.at(-1)!.key;
    expect(secondKey).not.toBe(firstKey); expect(writes()).toHaveLength(2);
    const mark = f.requests.length, newReconcile = f.actions.reconcileAction(secondKey);
    old.resolve(jsonResource({ scope: resourceScope, job: beforeWrite })); await settleResources();
    expect(reads).toBe(2); expect(f.requests.length).toBeGreaterThan(mark);
    expect(f.view().actions.find((action) => action.key === secondKey)?.reconciled).toBe(false);
    await f.actions.resumeCron("job-a"); expect(writes()).toHaveLength(2);
    fresh.resolve(outcome === "error" ? new Response("Neuer Read fehlgeschlagen")
      : outcome === "missing" ? resourceRejection("TARGET_UNAVAILABLE", "not_sent", 404)
      : jsonResource({ scope: resourceScope, job: outcome === "wrong-target" ? cronJob("other") : f.jobs.get("job-a") }));
    await Promise.all([oldReconcile, newReconcile]);
    expect(f.view().actions.find((action) => action.key === secondKey)?.reconciled).toBe(outcome === "valid" || outcome === "missing");
    if (outcome === "valid") expect(f.view().cron.detail.data?.job.name).toBe("Tatsächliche zweite Wirkung");
    if (outcome === "error" || outcome === "wrong-target") { await f.actions.resumeCron("job-a"); expect(writes()).toHaveLength(2); }
    expect(f.forgotten).toEqual([]); expect(maps().fresh.size).toBe(0);
  });
  it("teilt je Vorgang80 Doppelklicks, aber keinen Read zwischen altem A und neuem B", async () => {
    const firstKey = await firstCycle();
    const old = heldResource<Response>(), fresh = heldResource<Response>(); let reads = 0;
    f.setHandler((request) => request.method !== "GET" ? new Response("unknown")
      : request.path === "cron/jobs/job-a" ? ++reads === 1 ? old.promise : fresh.promise : undefined);
    const oldBatch = Array.from({ length: 80 }, () => f.actions.reconcileAction(firstKey)); await settleResources();
    await f.actions.pauseCron("job-a"); const secondKey = f.view().actions.at(-1)!.key;
    const newBatch = Array.from({ length: 80 }, () => f.actions.reconcileAction(secondKey));
    old.resolve(jsonResource({ scope: resourceScope, job: cronJob() })); await settleResources();
    expect(reads).toBe(2); expect(f.view().actions.at(-1)?.reconciled).toBe(false);
    fresh.resolve(jsonResource({ scope: resourceScope, job: cronJob() })); await Promise.all([...oldBatch, ...newBatch]);
    expect(reads).toBe(2); expect(f.view().actions.at(-1)?.reconciled).toBe(true);
    expect(maps().fresh.size).toBe(0); expect(maps().open.size).toBe(0); expect(writes()).toHaveLength(2);
  });
  it.each(["cron.create", "session.delete"])("erhält nach einem alten ready-Emit einen eigenen neuen %s-Abgleich", async (operation) => {
    f = await resourceFixture(operation === "session.delete" ? "session-delete" : "cron", { deleteSessionId: "full" });
    const invoke = () => operation === "cron.create" ? f.actions.createCron(cronFields) : f.actions.deleteSession(f.actions.prepareSessionDeletion()!);
    f.setHandler((request) => request.method !== "GET" ? new Response("unknown") : undefined);
    await invoke(); const firstKey = f.view().actions.at(-1)!.key; await f.actions.reconcileAction(firstKey);
    const old = heldResource<Response>(), fresh = heldResource<Response>(); let reads = 0;
    f.setHandler((request) => request.method !== "GET" ? new Response("unknown") : ++reads === 1 ? old.promise : fresh.promise);
    const oldReconcile = f.actions.reconcileAction(firstKey); await settleResources();
    let started = false, secondWrite: Promise<void> | undefined;
    const stop = f.runtime.subscribe(() => {
      const ready = operation === "cron.create" ? f.view().cron.list.status === "ready" : f.view().sessionDeletion.status === "ready";
      if (!started && ready) { started = true; secondWrite = invoke(); }
    });
    const response = operation === "cron.create" ? { scope: resourceScope, jobs: [...f.jobs.values()], truncated: false }
      : { scope: resourceScope, requestedSessionId: "full", title: "full", deletable: true, reason: null, effect: "compression-chain" };
    old.resolve(jsonResource(response)); await settleResources(); stop(); await secondWrite;
    const secondKey = f.view().actions.at(-1)!.key;
    expect(secondKey).not.toBe(firstKey); expect(writes()).toHaveLength(2);
    const newReconcile = f.actions.reconcileAction(secondKey); await settleResources();
    expect(reads).toBe(2); expect(f.view().actions.at(-1)?.reconciled).toBe(false);
    fresh.resolve(jsonResource(response)); await Promise.all([oldReconcile, newReconcile]);
    expect(f.view().actions.at(-1)?.reconciled).toBe(true); expect(writes()).toHaveLength(2); expect(f.forgotten).toEqual([]);
  });
  it("entwertet beide Zyklusreservierungen bei Hidden-A-B-A ohne neue Writefreigabe", async () => {
    const firstKey = await firstCycle();
    const old = heldResource<Response>(); let first = true;
    f.setHandler((request) => request.method !== "GET" ? new Response("unknown")
      : request.path === "cron/jobs/job-a" && first ? (first = false, old.promise) : undefined);
    const oldReconcile = f.actions.reconcileAction(firstKey); await settleResources();
    await f.actions.pauseCron("job-a"); const secondKey = f.view().actions.at(-1)!.key;
    const newReconcile = f.actions.reconcileAction(secondKey); await settleResources();
    f.update({ visible: false }); f.update({ visible: true });
    old.resolve(jsonResource({ scope: resourceScope, job: cronJob() })); await Promise.all([oldReconcile, newReconcile]); await settleResources();
    expect(f.view().actions.find((action) => action.key === secondKey)?.reconciled).toBe(false);
    expect(maps().fresh.size).toBe(0); expect(writes()).toHaveLength(2);
  });
  it("hält130 echte Unknown-/Abgleichzyklen begrenzt und gibt alle Reservierungen frei", async () => {
    f = await resourceFixture(); await f.select();
    f.setHandler((request) => request.method !== "GET" ? new Response("unknown") : undefined);
    for (let index = 0; index < 130; index++) {
      await f.actions.pauseCron("job-a"); const key = f.view().actions.at(-1)!.key;
      await f.actions.reconcileAction(key);
      expect(f.view().actions.at(-1)?.reconciled).toBe(true); expect(maps().fresh.size).toBe(0);
      expect(f.view().actions.length).toBeLessThanOrEqual(resourcePolicy.actions);
    }
    expect(writes()).toHaveLength(130); expect(maps().open.size).toBe(0);
  });
  it("begrenzt offene Abgleichvorgänge auch beim Verdrängen alter bereits abgeglichener Aktionen", async () => {
    f = await resourceFixture(); await f.select();
    f.setHandler((request) => request.method !== "GET" ? new Response("unknown") : undefined);
    for (let index = 0; index < resourcePolicy.actions; index++) {
      await f.actions.pauseCron("job-a"); await f.actions.reconcileAction(f.view().actions.at(-1)!.key);
    }
    const held = heldResource<Response>();
    f.setHandler((request) => request.method !== "GET" ? new Response("unknown")
      : request.path === "cron/jobs/job-a" ? held.promise.then((response) => response.clone()) : undefined);
    const batch = f.view().actions.map((action) => f.actions.reconcileAction(action.key)); await settleResources();
    expect(maps().fresh.size).toBe(resourcePolicy.actions);
    await f.actions.pauseCron("job-a"); const current = f.view().actions.at(-1)!.key;
    await f.actions.reconcileAction(current);
    expect(f.view().actions.at(-1)?.reconciled).toBe(false); expect(f.view().actionError?.code).toBe("CLIENT_BUSY");
    expect(maps().fresh.size).toBe(resourcePolicy.actions);
    held.resolve(jsonResource({ scope: resourceScope, job: cronJob() })); await Promise.all(batch);
    expect(maps().fresh.size).toBe(0);
    f.setHandler((request) => request.method !== "GET" ? new Response("unknown") : undefined);
    await f.actions.reconcileAction(current); expect(f.view().actions.at(-1)?.reconciled).toBe(true);
    expect(writes()).toHaveLength(resourcePolicy.actions + 1);
  });
});
