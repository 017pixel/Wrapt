import { afterEach, describe, expect, it, vi } from "vitest";
import { cronFields, cronJob, heldResource, jsonResource, resourceFixture, resourceRejection, resourceScope,
  settleResources, type ResourceFixture } from "./resource-test-fixtures";

describe("Zielbezogene Ressourcenaktionen und Bestätigungen", () => {
  let f: ResourceFixture;
  afterEach(() => { f?.cleanup(); vi.useRealTimers(); });
  it.each(["create", "update", "pause", "resume", "run", "delete"] as const)("reserviert %s synchron vor einem zweiten Klick", async (operation) => {
    f = await resourceFixture(); await f.select();
    const held = heldResource<Response>();
    f.setHandler((request) => request.method !== "GET" ? held.promise : undefined);
    const token = operation === "run" || operation === "delete" ? f.actions.prepareCronConfirmation(operation)! : null;
    const run = () => operation === "create" ? f.actions.createCron(cronFields) : operation === "update" ? f.actions.updateCron("job-a", { prompt: "Neu" })
      : operation === "pause" ? f.actions.pauseCron("job-a") : operation === "resume" ? f.actions.resumeCron("job-a")
      : operation === "run" ? f.actions.runCron(token!) : f.actions.deleteCron(token!);
    const first = run(), second = run(); await settleResources();
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(1);
    const nativeOperation = operation === "run" ? "trigger" : operation;
    held.resolve(jsonResource({ scope: resourceScope, outcome: "confirmed", operation: nativeOperation,
      jobId: operation === "create" ? "new" : "job-a", job: operation === "delete" ? null : cronJob(operation === "create" ? "new" : "job-a") }));
    await Promise.all([first, second]);
    expect(f.view().actions).toHaveLength(1); expect(f.view().actions[0]!.status).toBe("confirmed");
  });
  it("sperrt verschiedene Aktionen am selben Ziel, lässt andere Ziele unabhängig offen", async () => {
    f = await resourceFixture();
    const heldA = heldResource<Response>(), heldB = heldResource<Response>();
    f.setHandler((request) => request.method === "GET" ? undefined : request.path.includes("job-a") ? heldA.promise : heldB.promise);
    const one = f.actions.pauseCron("job-a"), duplicate = f.actions.resumeCron("job-a"), two = f.actions.pauseCron("job-b");
    await settleResources(); expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(2);
    heldA.resolve(jsonResource({ scope: resourceScope, outcome: "confirmed", operation: "pause", jobId: "job-a", job: cronJob("job-a") }));
    heldB.resolve(jsonResource({ scope: resourceScope, outcome: "confirmed", operation: "pause", jobId: "job-b", job: cronJob("job-b") }));
    await Promise.all([one, duplicate, two]); expect(f.view().actions).toHaveLength(2);
  });
  it("behält Pausedwarning, native Repeat-/Zusatzfelder und die konkrete Runquittung", async () => {
    f = await resourceFixture();
    f.jobs.set("job-a", cronJob("job-a", { paused: true, repeat: 7, completedRuns: 2,
      execution: { mode: "script", script: "readonly-script", noAgent: true }, additional: [{ key: "custom", value: "Bleibt", truncated: false }] }));
    await f.select();
    const token = f.actions.prepareCronConfirmation("run")!;
    expect(token.paused).toBe(true);
    await f.actions.runCron(token);
    expect(f.view().actions.at(-1)?.result).toMatchObject({ operation: "trigger", jobId: "job-a" });
    expect(f.view().cron.detail.data?.job).toMatchObject({ repeat: 7, completedRuns: 2, additional: [{ key: "custom", value: "Bleibt" }] });
    expect(f.requests.find((request) => request.path.endsWith("/trigger"))?.body).toEqual({ scope: resourceScope, confirm: true });
  });
  it.each(["copied", "refreshed", "selection", "area"])("sendet mit %s Bestätigung keinen Write", async (kind) => {
    f = await resourceFixture(); await f.select();
    let token = f.actions.prepareCronConfirmation("delete")!;
    if (kind === "copied") token = { ...token };
    else if (kind === "refreshed") await f.actions.refreshCronDetail();
    else if (kind === "selection") await f.select("job-b");
    else { f.update({ area: "memory" }); f.update({ area: "cron" }); await settleResources(); }
    await f.actions.deleteCron(token);
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
    expect(f.view().actionError?.outcome).toBe("not_sent");
  });
  it("behält Auswahl und Daten bei409 und behauptet keinen Erfolg aus Promise<void>", async () => {
    f = await resourceFixture(); await f.select();
    const previous = f.view().cron.list.data;
    f.setHandler((request) => request.method !== "GET" ? resourceRejection() : undefined);
    await f.actions.pauseCron("job-a");
    expect(f.view().actions.at(-1)).toMatchObject({ status: "rejected", result: null, error: { status: 409, outcome: "rejected" } });
    expect(f.view().cron.selectedId).toBe("job-a"); expect(f.view().cron.list.data).toBe(previous);
  });
  it("sperrt Unknown bis zum bewussten zielgenauen Read und wiederholt keine Mutation", async () => {
    f = await resourceFixture(); await f.select();
    f.setHandler((request) => request.method !== "GET" ? new Response("invalid") : undefined);
    await f.actions.pauseCron("job-a");
    const key = f.view().actions.at(-1)!.key;
    expect(f.view().actions.at(-1)?.status).toBe("unknown");
    await f.actions.pauseCron("job-a"); await f.actions.refresh();
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(1);
    expect(f.view().actions.at(-1)?.reconciled).toBe(false);
    await f.actions.reconcileAction(key);
    expect(f.view().actions.at(-1)?.reconciled).toBe(true);
    f.setHandler(null); await f.actions.pauseCron("job-a");
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(2);
    expect(f.view().actions.at(-1)?.status).toBe("confirmed");
  });
  it("gibt nach fehlgeschlagenem Abgleich keine Wiederholung frei", async () => {
    f = await resourceFixture(); await f.select();
    f.setHandler(() => new Response("invalid"));
    await f.actions.pauseCron("job-a"); const key = f.view().actions.at(-1)!.key;
    await f.actions.reconcileAction(key); await f.actions.pauseCron("job-a");
    expect(f.view().actions.at(-1)?.reconciled).toBe(false);
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(1);
  });
  it("erhält einen verschwundenen OneShot als missing neben der echten Runquittung", async () => {
    f = await resourceFixture(); await f.select();
    f.setHandler((request) => {
      if (!request.path.endsWith("/trigger")) return;
      f.jobs.delete("job-a");
      return jsonResource({ scope: resourceScope, outcome: "confirmed", operation: "trigger", jobId: "job-a", job: null });
    });
    await f.actions.runCron(f.actions.prepareCronConfirmation("run")!);
    expect(f.view().cron.detail.status).toBe("missing");
    expect(f.view().cron.selectedId).toBe("job-a");
    expect(f.view().actions.at(-1)).toMatchObject({ status: "confirmed", result: { jobId: "job-a", job: null } });
  });
  it("finalisiert möglichen Send bei Hidden ehrlich unknown und verwirft späten Erfolg", async () => {
    f = await resourceFixture(); await f.select();
    const held = heldResource<Response>();
    f.setHandler((request) => request.method !== "GET" ? held.promise : undefined);
    const action = f.actions.pauseCron("job-a"); await settleResources();
    f.update({ active: false }); await action;
    expect(f.view().actions.at(-1)).toMatchObject({ status: "unknown", result: null });
    held.resolve(jsonResource({ scope: resourceScope, operation: "pause", jobId: "job-a", job: cronJob(), outcome: "confirmed" })); await settleResources();
    expect(f.view().actions.at(-1)?.status).toBe("unknown");
  });
  it("schickt bei reentrantem Schließen während Pendingemit noch keine Mutation", async () => {
    f = await resourceFixture();
    const stop = f.runtime.subscribe(() => { if (f.view().actions.some((action) => action.status === "pending")) f.update({ active: false }); });
    await f.actions.pauseCron("job-a"); stop();
    expect(f.requests.filter((request) => request.method !== "GET")).toHaveLength(0);
  });
});
