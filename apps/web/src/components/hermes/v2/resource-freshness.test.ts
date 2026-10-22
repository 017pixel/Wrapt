import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cronFields, cronJob, heldResource, jsonResource, resourceFixture, resourceRejection,
  resourceScope, settleResources, type ResourceFixture } from "./resource-test-fixtures";

describe("Bewusster Ressourcenabgleich nach unbekannter Mutation", () => {
  let f: ResourceFixture;
  beforeEach(() => vi.useFakeTimers());
  afterEach(async () => { f?.cleanup(); await settleResources(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });
  const online = (id: string) => f.gateway.socket.receive({ v: 1, type: "connection", state: "online", epoch: "epoch", connectionId: id });
  async function detailChain(writeDuringFollowup: boolean) {
    f = await resourceFixture(); await f.select();
    const first = heldResource<Response>(), second = heldResource<Response>();
    let reads = 0;
    let fresh: () => Response | Promise<Response> = () => jsonResource({ scope: resourceScope, job: cronJob("job-a", { name: "Bewusst frisch" }) });
    f.setHandler((request) => {
      if (request.method !== "GET") return new Response("Unklare Quittung");
      if (request.path !== "cron/jobs/job-a") return;
      reads++;
      return reads === 1 ? first.promise : reads === 2 ? second.promise : fresh();
    });
    const background = f.actions.refreshCronDetail(); await settleResources();
    const duplicate = f.actions.refreshCronDetail();
    if (!writeDuringFollowup) await f.actions.pauseCron("job-a");
    first.resolve(jsonResource({ scope: resourceScope, job: cronJob() })); await settleResources();
    expect(reads).toBe(2);
    if (writeDuringFollowup) await f.actions.pauseCron("job-a");
    const key = f.view().actions.at(-1)!.key;
    expect(f.view().actions.at(-1)?.status).toBe("unknown");
    return { background, duplicate, key, second, reads: () => reads, setFresh(value: typeof fresh) { fresh = value; } };
  }
  it.each([false, true])("beginnt nach dem bewussten Abgleich einen neuen Read, Write im Folgeread=%s", async (during) => {
    const chain = await detailChain(during);
    const reconcile = f.actions.reconcileAction(chain.key); await settleResources();
    expect(chain.reads()).toBe(2); expect(f.view().actions.at(-1)?.reconciled).toBe(false);
    chain.second.resolve(jsonResource({ scope: resourceScope, job: cronJob("job-a", { name: "Vor dem Abgleich" }) }));
    await Promise.all([chain.background, chain.duplicate, reconcile]);
    expect(chain.reads()).toBe(3); expect(f.view().cron.detail.data?.job.name).toBe("Bewusst frisch");
    expect(f.view().actions.at(-1)?.reconciled).toBe(true);
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(1);
  });
  it.each(["error", "missing"])("wertet ausschließlich den neuen %s-Read und nicht dessen alten Vorgänger aus", async (kind) => {
    const chain = await detailChain(true);
    chain.setFresh(() => kind === "error" ? new Response("Ungültiger frischer Read") : resourceRejection("TARGET_UNAVAILABLE", "not_sent", 404));
    const reconcile = f.actions.reconcileAction(chain.key);
    chain.second.resolve(jsonResource({ scope: resourceScope, job: cronJob() }));
    await Promise.all([chain.background, chain.duplicate, reconcile]);
    expect(chain.reads()).toBe(3); expect(f.view().cron.detail.status).toBe(kind === "error" ? "error" : "missing");
    expect(f.view().actions.at(-1)?.reconciled).toBe(kind === "missing");
    if (kind === "error") await f.actions.pauseCron("job-a");
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(1);
    expect(f.forgotten).toEqual([]); expect(f.view().cron.selectedId).toBe("job-a");
  });
  it("fasst doppelte bewusste Abgleiche in einem erst danach gestarteten Read zusammen", async () => {
    const chain = await detailChain(true);
    const fresh = heldResource<Response>(); chain.setFresh(() => fresh.promise);
    const first = f.actions.reconcileAction(chain.key), second = f.actions.reconcileAction(chain.key);
    chain.second.resolve(jsonResource({ scope: resourceScope, job: cronJob() })); await settleResources();
    expect(chain.reads()).toBe(3);
    fresh.resolve(jsonResource({ scope: resourceScope, job: cronJob() }));
    await Promise.all([chain.background, chain.duplicate, first, second]);
    expect(chain.reads()).toBe(3); expect(f.view().actions.at(-1)?.reconciled).toBe(true);
  });
  it.each(["hidden", "owner", "area", "connection"])("erhält die Sperre nach %s-A-B-A während des wartenden Abgleichs", async (kind) => {
    const chain = await detailChain(true);
    const reconcile = f.actions.reconcileAction(chain.key); await settleResources();
    if (kind === "hidden") { f.update({ visible: false }); f.update({ visible: true }); }
    if (kind === "area") { f.update({ area: "memory" }); f.update({ area: "cron" }); }
    if (kind === "owner") {
      const owner = f.chat.owners.records.get("resource-owner")!;
      f.chat.owners.select(owner, "other"); f.chat.owners.select(owner, null);
    }
    if (kind === "connection") { online(crypto.randomUUID()); online(f.gateway.socket.connectionId); }
    chain.second.resolve(jsonResource({ scope: resourceScope, job: cronJob() }));
    await Promise.all([chain.background, chain.duplicate, reconcile]); await settleResources();
    expect(f.view().actions.find((action) => action.key === chain.key)?.reconciled).toBe(false);
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(1);
  });
  it("zeigt nach unbekanntem Create erst durch einen neuen bewussten Katalogread den erzeugten Job", async () => {
    f = await resourceFixture();
    const stale = { scope: resourceScope, jobs: [...f.jobs.values()], truncated: false };
    const first = heldResource<Response>(), second = heldResource<Response>();
    let lists = 0, creates = 0;
    f.setHandler((request) => {
      if (request.method === "POST") { creates++; f.jobs.set(`created-${creates}`, cronJob(`created-${creates}`)); return new Response("Quittung verloren"); }
      if (request.path !== "cron/jobs") return;
      lists++;
      return lists === 1 ? first.promise : lists === 2 ? second.promise : jsonResource({ ...stale, jobs: [...f.jobs.values()] });
    });
    let started = false, creation: Promise<void> | undefined;
    const stop = f.runtime.subscribe(() => {
      // Der tatsächliche Createguard verlangt ready; der erste Emit belegt ihn.
      if (!started && lists === 1 && f.view().cron.list.status === "ready") { started = true; creation = f.actions.createCron(cronFields); }
    });
    const background = f.actions.refresh(), duplicate = f.actions.refresh();
    first.resolve(jsonResource(stale)); await settleResources(); stop(); await creation;
    expect(creates).toBe(1); expect(lists).toBe(2);
    const key = f.view().actions.at(-1)!.key;
    const reconcile = f.actions.reconcileAction(key);
    second.resolve(jsonResource(stale)); await Promise.all([background, duplicate, reconcile]);
    expect(lists).toBe(3); expect(f.view().cron.list.data?.jobs.some((job) => job.id === "created-1")).toBe(true);
    expect(f.view().actions.at(-1)?.reconciled).toBe(true); expect(creates).toBe(1);
  });
  it("liest nach unbekanntem Delete die Sessionvorschau neu statt einen alten Folgeread anzuerkennen", async () => {
    f = await resourceFixture("session-delete", { deleteSessionId: "full" });
    f.setHandler((request) => request.method === "DELETE" ? new Response("Quittung verloren") : undefined);
    await f.actions.deleteSession(f.actions.prepareSessionDeletion()!); const key = f.view().actions.at(-1)!.key;
    const first = heldResource<Response>(), second = heldResource<Response>(); let previews = 0;
    const preview = (title: string) => ({ scope: resourceScope, requestedSessionId: "full", title, deletable: true, reason: null, effect: "compression-chain" });
    f.setHandler((request) => {
      if (request.path !== "sessions/full/deletion") return;
      previews++;
      return previews === 1 ? first.promise : previews === 2 ? second.promise : jsonResource(preview("Neu abgeglichen"));
    });
    const background = f.actions.refresh(), duplicate = f.actions.refresh();
    first.resolve(jsonResource(preview("Vor dem Abgleich"))); await settleResources();
    const reconcile = f.actions.reconcileAction(key);
    second.resolve(jsonResource(preview("Alter Folgeread"))); await Promise.all([background, duplicate, reconcile]);
    expect(previews).toBe(3); expect(f.view().sessionDeletion.data?.title).toBe("Neu abgeglichen");
    expect(f.view().actions.at(-1)?.reconciled).toBe(true); expect(f.forgotten).toEqual([]);
    expect(f.requests.filter((request) => request.method === "DELETE")).toHaveLength(1);
  });
});
