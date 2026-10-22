import { afterEach, describe, expect, it } from "vitest";
import { ResourceClient } from "./resource-client";
import { ResourceRuntime } from "./resource-runtime";
import { resourcePolicy } from "./resource-policy";
import { cronJob, diagnosticsData, heldResource, jsonResource, resourceFixture, resourceScope, settleResources, type ResourceFixture } from "./resource-test-fixtures";

describe("Ressourcenbudgets, Reentranz und unbekannte Vorgänge", () => {
  let f: ResourceFixture;
  afterEach(() => f?.cleanup());
  it("beendet reentrante Readaufrufe nach höchstens einem zusammengefassten Folgeread", async () => {
    f = await resourceFixture();
    const before = f.requests.length;
    const stop = f.runtime.subscribe(() => { void f.actions.refresh(); });
    await f.actions.refresh(); await settleResources(); stop();
    expect(f.requests.length - before).toBe(2);
  });
  it("begrenzt ungeklärte Createquittungen ohne einen alten Unknown-Eintrag zu verdrängen", async () => {
    f = await resourceFixture();
    f.setHandler((request) => request.method !== "GET" ? new Response("invalid") : undefined);
    for (let index = 0; index < resourcePolicy.actions; index++) {
      // Ein anderer nativer Scope ist ein anderes konkretes Ressourcenprofil.
      f.setScope(index.toString(16).padStart(64, "0")); await f.actions.refresh(); await settleResources();
      await f.actions.createCron({ name: "Test", prompt: "Auftrag", schedule: "every 1h", repeat: null, paused: false, projectId: null });
    }
    expect(f.view().actions).toHaveLength(resourcePolicy.actions);
    expect(f.view().actions.every((action) => action.status === "unknown")).toBe(true);
    f.setScope("f".repeat(64)); await f.actions.refresh(); await settleResources();
    const before = f.requests.filter((request) => request.method !== "GET").length;
    await f.actions.createCron({ name: "Mehr", prompt: "Auftrag", schedule: "every 1h", repeat: null, paused: false, projectId: null });
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(before);
    expect(f.view().actionError?.code).toBe("CLIENT_BUSY");
  });
  it("behandelt Unknown gleicher ID in anderem Scope nicht als abgeglichenen alten Vorgang", async () => {
    f = await resourceFixture(); await f.select();
    f.setHandler((request) => request.method !== "GET" ? new Response("invalid") : undefined);
    await f.actions.pauseCron("job-a"); const oldKey = f.view().actions.at(-1)!.key;
    f.setScope("b".repeat(64)); await f.actions.refresh(); await settleResources();
    await f.actions.reconcileAction(oldKey);
    expect(f.view().actions.find((action) => action.key === oldKey)?.reconciled).toBe(false);
    expect(f.view().actionError?.code).toBe("STALE_RESOURCE_CONTEXT");
    f.setHandler(null); await f.actions.pauseCron("job-a");
    expect(f.view().actions.at(-1)?.status).toBe("confirmed");
  });
  it("gibt Unknown nicht frei, wenn ein zusammengefasster letzter Folgeread fehlschlägt", async () => {
    f = await resourceFixture(); await f.select();
    f.setHandler((request) => request.method !== "GET" ? new Response("invalid") : undefined);
    await f.actions.pauseCron("job-a"); const key = f.view().actions.at(-1)!.key;
    const held = heldResource<Response>(); let first = true;
    f.setHandler((request) => {
      if (request.path !== "cron/jobs/job-a") return;
      if (first) { first = false; return held.promise; }
      return new Response("invalid");
    });
    const read = f.actions.refreshCronDetail(); await settleResources();
    const reconcile = f.actions.reconcileAction(key);
    held.resolve(jsonResource({ scope: resourceScope, job: cronJob() })); await Promise.all([read, reconcile]);
    expect(f.view().actions.find((action) => action.key === key)?.reconciled).toBe(false);
  });
  it("lässt alten Clipboardabschluss keinen neuen offenen Copyvorgang entsperren", async () => {
    f = await resourceFixture(null);
    const old = heldResource<void>(), current = heldResource<void>(); let calls = 0;
    const runtime = new ResourceRuntime(f.chat, new ResourceClient(async () => jsonResource(diagnosticsData())), () => ++calls === 1 ? old.promise : current.promise);
    const options = { ownerId: "resource-owner", enabled: true, active: true, visible: true, area: "diagnostics" as const, signal: new AbortController().signal };
    runtime.mount(options); await settleResources(); const first = runtime.methods.copyDiagnostics();
    runtime.update({ ...options, active: false }); runtime.update(options); await settleResources();
    const second = runtime.methods.copyDiagnostics(); old.resolve(); await first;
    const duplicate = runtime.methods.copyDiagnostics(); expect(calls).toBe(2);
    current.resolve(); await Promise.all([second, duplicate]); expect(runtime.getSnapshot().copy.status).toBe("copied"); runtime.dispose();
  });
  it("schützt fremde Owner-A-B-A beim bestätigten Cleanup derselben vollen ID", async () => {
    f = await resourceFixture();
    const owner = f.chat.owners.records.get("resource-owner")!;
    f.chat.owners.select(owner, "full"); await settleResources();
    const before = new Map([[owner, owner.generation]]);
    f.chat.owners.select(owner, "other"); f.chat.owners.select(owner, "full"); await settleResources();
    expect(f.chat.forgetDeletedSessions(["full"], before)).toEqual([]);
    expect(owner.sessionId).toBe("full"); expect(f.chat.sessionIsLeased("full")).toBe(true);
  });
});
