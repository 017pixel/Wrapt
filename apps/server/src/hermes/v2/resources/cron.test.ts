import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import { resourceFixture } from "./resource.fixture.js";

describe("Native V2-Cronressourcen", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); });
  afterEach(async () => { await f.close(); });
  it("liest native Arrays profilgebunden ohne Chatlease und normalisiert Runsekunden", async () => {
    const list = await f.request("GET", "/cron/jobs"); expect(list.statusCode).toBe(200); expect(list.json().jobs[0].id).toBe("job-1");
    expect(f.pool.existing()).toHaveLength(0);
    const runs = await f.request("GET", "/cron/jobs/job-1/runs"); expect(runs.statusCode).toBe(200); expect(runs.json().runs[0].startedAt).toBe(1_700_000_000_000);
    expect(f.paths.filter((path) => path.startsWith("/api/cron/")).every((path) => path.includes("profile=default"))).toBe(true);
  });
  it("akzeptiert Projekt-Slugs und gibt keinen fremden Ausführungstunnel frei", async () => {
    const scope = await f.scope(); const response = await f.request("POST", "/cron/jobs", { scope, name: "Neu", prompt: "Aufgabe", schedule: "in 2 hours", repeat: "once", paused: true, projectId: "wrapt" });
    expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ outcome: "confirmed", operation: "create", jobId: "created", job: { paused: true } });
    expect(f.writes[0]?.body).toMatchObject({ workdir: f.root, paused: true, deliver: "local" });
    const blocked = await f.request("POST", "/cron/jobs", { scope, name: "x", prompt: "x", schedule: "x", repeat: null, paused: false, projectId: null, script: "evil" });
    expect(blocked.statusCode).toBe(400); expect(f.writes).toHaveLength(1);
  });
  it("erhält echte Scriptwirkung lesbar und serialisiert Zusatzfelder beim Edit nicht zurück", async () => {
    f.jobs.set("job-1", f.job("job-1", { no_agent: true, script: "own.sh", model: "native-model", context_from: ["other"] }));
    const scope = await f.scope(); const response = await f.request("PUT", "/cron/jobs/job-1", { scope, updates: { prompt: "Neuer Prompt", paused: false } });
    expect(response.statusCode).toBe(200); expect(response.json().job.execution).toEqual({ mode: "script", noAgent: true, script: "own.sh" });
    expect(f.writes.map((write) => write.body)).toEqual([{ updates: { prompt: "Neuer Prompt" } }, undefined]);
    expect(f.jobs.get("job-1")?.context_from).toEqual(["other"]);
  });
  it.each(["pause", "resume", "trigger", "delete"] as const)("bindet %s an exakte frisch gelistete ID und Quittung", async (operation) => {
    const scope = await f.scope(); const response = await f.request(operation === "delete" ? "DELETE" : "POST", `/cron/jobs/job-1${operation === "delete" ? "" : `/${operation}`}`, { scope, ...(["trigger", "delete"].includes(operation) ? { confirm: true } : {}) });
    expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ jobId: "job-1", operation, outcome: "confirmed" }); expect(f.writes).toHaveLength(1);
  });
  it.each(["trigger", "delete"])("fordert vor %s explizite Bestätigung", async (operation) => {
    const scope = await f.scope(); expect((await f.request(operation === "delete" ? "DELETE" : "POST", `/cron/jobs/job-1${operation === "delete" ? "" : `/${operation}`}`, { scope })).statusCode).toBe(400); expect(f.writes).toHaveLength(0);
  });
  it("verwirft Fremdprofil, ID-Fallback und defekte Quittung", async () => {
    const scope = await f.scope(); f.jobs.set("job-1", f.job("job-1", { profile: "other" }));
    expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope })).statusCode).toBe(404); expect(f.writes).toHaveLength(0);
    f.jobs.set("job-1", f.job());
    f.hook((method, path) => method === "GET" && new URL(path, "http://f").pathname === "/api/cron/jobs/job-1" ? f.job("different") : undefined);
    expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope })).statusCode).toBe(404); expect(f.writes).toHaveLength(0);
    f.hook((method) => method === "POST" ? f.job("different") : undefined);
    expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope })).json().outcome).toBe("unknown"); expect(f.writes).toHaveLength(1);
  });
  it("behält native 409 und Unknown ohne automatischen Retry", async () => {
    const scope = await f.scope(); f.hook((method) => { if (method === "POST") throw Object.assign(new Error(), { status: 409 }); });
    const conflict = await f.request("POST", "/cron/jobs/job-1/trigger", { scope, confirm: true }); expect(conflict.statusCode).toBe(409); expect(conflict.json().outcome).toBe("rejected");
    f.hook((method) => { if (method === "POST") throw new Error("Netzverlust"); });
    expect((await f.request("POST", "/cron/jobs/job-1/trigger", { scope, confirm: true })).json().outcome).toBe("unknown"); expect(f.writes).toHaveLength(2);
  });
  it("bestätigt echte OneShotquittung auch nach nativem Verschwinden", async () => {
    const scope = await f.scope(); f.jobs.get("job-1")!.enabled = false;
    f.hook((method) => { if (method === "POST") { f.jobs.delete("job-1"); return f.job("job-1", { enabled: false, state: "completed" }); } });
    const response = await f.request("POST", "/cron/jobs/job-1/trigger", { scope, confirm: true }); expect(response.statusCode).toBe(200); expect(response.json().job.state).toBe("completed");
  });
  it("sendet bei entkommenem Arbeitsordner nicht", async () => {
    const scope = await f.scope(); f.jobs.get("job-1")!.workdir = "/etc";
    const response = await f.request("POST", "/cron/jobs/job-1/trigger", { scope, confirm: true }); expect(response.statusCode).not.toBe(200); expect(f.writes).toHaveLength(0);
  });
  it("erkennt beobachtetes A→B→A und bestätigt unverändertes A erneut", async () => {
    const old = await f.scope(); expect(await f.scope()).toBe(old); await mkdir(join(f.root, "other"));
    f.profile("other"); const other = await f.scope(); expect(other).not.toBe(old); f.profile("default");
    const current = await f.scope(); expect(current).not.toBe(old);
    expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope: old })).statusCode).toBe(409); expect(f.writes).toHaveLength(0);
    expect((await f.request("POST", "/cron/jobs/job-1/pause", { scope: current })).statusCode).toBe(200);
  });
  it("erkennt Profilverlust nach nativer Quittung als unknown", async () => {
    const scope = await f.scope(); await mkdir(join(f.root, "other"));
    f.hook((method) => { if (method === "POST") { f.profile("other"); return f.job(); } });
    const response = await f.request("POST", "/cron/jobs/job-1/pause", { scope }); expect(response.json().outcome).toBe("unknown"); expect(f.writes).toHaveLength(1);
  });
  it("erkennt einen vor dem Read umgehängten Symlink", async () => {
    const link = join(f.root, "project-link"); await symlink(f.root, link); const scope = await f.scope();
    await unlink(link); await symlink("/etc", link); f.jobs.get("job-1")!.workdir = link;
    expect((await f.request("POST", "/cron/jobs/job-1/resume", { scope })).statusCode).not.toBe(200); expect(f.writes).toHaveLength(0);
  });
  it("weist Origin, Flag-off und freie native Queryfelder vor Reads ab", async () => {
    expect((await f.request("GET", "/memory", undefined, "a", "http://evil.test")).statusCode).toBe(403);
    expect((await f.request("GET", "/cron/jobs?profile=all")).statusCode).toBe(400);
    f.deps.enabled = () => false; expect((await f.request("GET", "/cron/jobs")).statusCode).toBe(403); expect(f.paths).toHaveLength(0);
  });
});
