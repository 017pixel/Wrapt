// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hermesV2EventSchema } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { cronJob, heldResource, jsonResource, resourceFixture, resourceScope, settleResources, type ResourceFixture } from "./resource-test-fixtures";
import { resourcePolicy } from "./resource-policy";

describe("Flüchtige Ressourcenreads und Kontextbarrieren", () => {
  let f: ResourceFixture | undefined;
  afterEach(() => { f?.cleanup(); f = undefined; vi.restoreAllMocks(); vi.useRealTimers(); });
  it.each(["enabled", "active", "visible"] as const)("liest bei %s=false nichts und erwirbt keinen weiteren Chatowner", async (key) => {
    f = await resourceFixture("cron", { [key]: false });
    expect(f.requests).toHaveLength(0); expect(f.chat.owners.records.size).toBe(1);
    expect(f.gateway.sockets).toHaveLength(1); expect(f.gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(0);
    await f.actions.refresh(); expect(f.requests).toHaveLength(0);
  });
  it("liest Ressourcen mit verdecktem ChatactualActive am vorhandenen Socket", async () => {
    f = await resourceFixture();
    expect(f.chat.owners.records.get("resource-owner")?.options.active).toBe(false);
    expect(f.view().cron.list.status).toBe("ready"); expect(f.view().available).toBe(true);
    expect(new URL(f.gateway.socket.url).searchParams.get("resources")).toBe("1");
    expect(f.gateway.sockets).toHaveLength(1);
  });
  it.each(["flag", "active", "visible", "signal", "unmount"])("bricht offene Reads bei %s ab und übernimmt späte Daten nicht", async (kind) => {
    f = await resourceFixture();
    const held = heldResource<Response>(); let abort: AbortSignal | undefined;
    f.setHandler((request) => { if (request.path === "cron/jobs") { abort = request.signal; return held.promise; } });
    const read = f.actions.refresh(); await settleResources();
    if (kind === "flag") useAppPreferences.setState({ hermesV2Enabled: false });
    else if (kind === "signal") f.controller.abort();
    else if (kind === "unmount") f.runtime.dispose();
    else f.update({ [kind]: false });
    expect(abort?.aborted).toBe(true);
    held.resolve(jsonResource({ scope: resourceScope, jobs: [cronJob("late")], truncated: false })); await read;
    expect(f.view().cron.list.data).toBeNull(); expect(f.view().available).toBe(false);
  });
  it("behandelt Dokumenthidden als eigene Read- und Actionbarriere", async () => {
    f = await resourceFixture(); await f.select();
    const token = f.actions.prepareCronConfirmation("delete")!;
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange"));
    await f.actions.deleteCron(token); await f.actions.refresh();
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
    expect(f.view().cron.list.data).toBeNull();
  });
  it("verwirft alte Detailantworten bei A-B-A trotz identischer Ziel-ID", async () => {
    f = await resourceFixture();
    const held = heldResource<Response>(); let first = true, staleSignal: AbortSignal | undefined;
    f.setHandler((request) => { if (request.path === "cron/jobs/job-a" && first) { first = false; staleSignal = request.signal; return held.promise; } });
    f.actions.selectCron("job-a"); await settleResources();
    f.actions.selectCron("job-b"); await settleResources();
    f.actions.selectCron("job-a"); await settleResources();
    const generation = f.view().generation;
    held.resolve(jsonResource({ scope: resourceScope, job: cronJob("job-a", { name: "ALTES A" }) })); await settleResources();
    expect(staleSignal?.aborted).toBe(true); expect(f.view().generation).toBe(generation);
    expect(f.view().cron.detail.data?.job.name).toBe("job-a");
  });
  it("entwertet Bestätigungen bei Owner-A-B-A und erhält den fremden Owner", async () => {
    f = await resourceFixture(); await f.select();
    const token = f.actions.prepareCronConfirmation("run")!;
    const owner = f.chat.owners.records.get("resource-owner")!;
    f.chat.owners.select(owner, "other"); f.chat.owners.select(owner, null); await settleResources();
    await f.actions.runCron(token);
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
    expect(f.chat.owners.records.size).toBe(1);
  });
  it("begrenzt parallele Detailreads auf zwei und startet abgebrochene Queueeinträge nicht", async () => {
    f = await resourceFixture(); await f.select();
    const held = heldResource<Response>();
    f.setHandler(() => held.promise);
    const before = f.requests.length;
    const first = f.actions.refreshCronDetail(), second = f.actions.refreshCronRuns(), third = f.actions.refresh();
    await settleResources(); expect(f.requests.length - before).toBe(2);
    f.update({ area: "memory" }); await settleResources();
    expect(f.requests.slice(before).filter((request) => request.path === "cron/jobs")).toHaveLength(0);
    held.resolve(jsonResource({})); await Promise.all([first, second, third]);
  });
  it("fasst identische offene Reads und einen zusätzlichen bewussten Anlass zusammen", async () => {
    f = await resourceFixture();
    const held = heldResource<Response>(); let first = true;
    f.setHandler((request) => { if (request.path === "cron/jobs" && first) { first = false; return held.promise; } });
    const before = f.requests.length;
    const one = f.actions.refresh(), two = f.actions.refresh(), three = f.actions.refresh(); await settleResources();
    expect(f.requests.length - before).toBe(1);
    held.resolve(jsonResource({ scope: resourceScope, jobs: [], truncated: false })); await Promise.all([one, two, three]);
    expect(f.requests.length - before).toBe(2);
  });
  it("beobachtet globale Croninvalidierung ohne Sessionlease und koalesziert die Reads", async () => {
    vi.useFakeTimers(); f = await resourceFixture();
    const before = f.requests.length;
    const event = hermesV2EventSchema.parse({ type: "resources.invalidated", epoch: "epoch", seq: null, sessionId: null, payload: { resource: "cron", sessionIds: [] } });
    f.gateway.socket.event(event); f.gateway.socket.event(event); f.gateway.socket.event(event);
    expect(f.view().cron.list.stale).toBe(true);
    await vi.advanceTimersByTimeAsync(resourcePolicy.invalidationMs); await settleResources();
    expect(f.requests.length - before).toBe(1); expect(f.view().cron.list.stale).toBe(false);
  });
  it("bereinigt keine Sitzungen aus einem globalen Invalidierungsevent", async () => {
    f = await resourceFixture();
    f.gateway.socket.event(hermesV2EventSchema.parse({ type: "resources.invalidated", epoch: "epoch", seq: null, sessionId: null,
      payload: { resource: "sessions", sessionIds: ["not-our-delete"] } }));
    await settleResources(); expect(f.forgotten).toEqual([]);
  });
  it("entwertet alte Scopebestätigung und liest nach Profilwechsel neu", async () => {
    f = await resourceFixture(); await f.select();
    const token = f.actions.prepareCronConfirmation("run")!, before = f.view().generation;
    f.setScope("b".repeat(64)); await f.actions.refresh(); await settleResources();
    expect(f.view().generation).toBeGreaterThan(before);
    expect(f.view().cron.list.data?.scope).toBe("b".repeat(64));
    await f.actions.runCron(token); expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
  });
  it("beendet Reads bei Reconnect und nutzt nur den regulären gemeinsamen Socketwechsel", async () => {
    f = await resourceFixture();
    const held = heldResource<Response>(); let first = true, aborted: AbortSignal | undefined;
    f.setHandler((request) => { if (first) { first = false; aborted = request.signal; return held.promise; } });
    const read = f.actions.refresh(); await settleResources();
    f.chat.client.reconnect(); await settleResources();
    expect(aborted?.aborted).toBe(true); expect(f.gateway.sockets).toHaveLength(2);
    expect(f.gateway.sockets[0]!.readyState).toBe(3); expect(f.view().cron.list.status).toBe("ready");
    held.resolve(jsonResource({ scope: resourceScope, jobs: [cronJob("late")], truncated: false })); await read;
    expect(f.view().cron.list.data?.jobs.some((job) => job.id === "late")).toBe(false);
  });
});
