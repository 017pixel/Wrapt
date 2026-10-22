import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";

describe("Cronziel und Zwischenquittungen", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); }); afterEach(async () => { await f.close(); });
  it("zeigt fremd annotierte Profiljobs nicht als eigene Ressourcen", async () => {
    f.jobs.set("foreign", f.job("foreign", { profile: "other", prompt: "fremder Inhalt" }));
    const result = await f.request("GET", "/cron/jobs"); expect(result.statusCode).toBe(200); expect(result.body).not.toContain("fremder Inhalt"); expect(result.json().truncated).toBe(true);
  });
  it("liest nativen Job nach den Profil-/CWDawaits erneut und sendet bei geänderter Workdir nicht", async () => {
    const scope = await f.scope(); let details = 0;
    f.hook((method, path) => { if (method === "GET" && new URL(path, "http://fake").pathname === "/api/cron/jobs/job-1" && ++details === 2) return f.job("job-1", { workdir: "/etc" }); });
    const result = await f.request("POST", "/cron/jobs/job-1/trigger", { scope, confirm: true });
    expect(result.statusCode).toBe(409); expect(details).toBe(2); expect(f.writes).toHaveLength(0);
  });
  it("sendet nach falscher Pausequittung kein nachfolgendes Edit oder Resume", async () => {
    const scope = await f.scope(); f.hook((method) => method === "POST" ? f.job("wrong-id") : undefined);
    const result = await f.request("PUT", "/cron/jobs/job-1", { scope, updates: { paused: true, prompt: "Änderung" } });
    expect(result.json().outcome).toBe("unknown"); expect(f.writes).toHaveLength(1);
  });
  it("behandelt definitive Ablehnung des zweiten Teils nach angenommener Pause als partial unknown", async () => {
    const scope = await f.scope(); f.hook((method) => { if (method === "PUT") throw Object.assign(new Error(), { status: 400 }); });
    const result = await f.request("PUT", "/cron/jobs/job-1", { scope, updates: { paused: true, prompt: "Änderung" } });
    expect(result.json().outcome).toBe("unknown"); expect(f.jobs.get("job-1")!.enabled).toBe(false); expect(f.writes).toHaveLength(2);
  });
  it("erhält get-only DI und lehnt nicht injizierte Writer vor dem Send ab", async () => {
    f.deps.resources = {}; const scope = await f.scope();
    const read = await f.request("GET", "/memory"); expect(read.statusCode).toBe(200);
    const result = await f.request("POST", "/cron/jobs/job-1/pause", { scope }); expect(result.statusCode).toBe(503); expect(result.json()).toMatchObject({ code: "UNSUPPORTED", outcome: "not_sent" }); expect(f.writes).toHaveLength(0);
  });
  it.each([
    [{ kind: "once", run_at: "2026-10-18T08:00:00+00:00" }, "once in 2h", "2026-10-18T08:00:00+00:00"],
    [{ kind: "cron", expr: "0 8 * * *" }, "Täglich um acht", "0 8 * * *"],
    [{ kind: "interval", minutes: 30 }, "Alle halbe Stunde", "every 30m"],
  ])("liefert wiederverwendbare native Schedules statt menschlicher Beschriftung: %j", async (schedule, label, expected) => {
    f.jobs.set("job-1", f.job("job-1", { schedule, schedule_display: label }));
    const result = await f.request("GET", "/cron/jobs/job-1"); expect(result.statusCode).toBe(200); expect(result.json().job.schedule).toBe(expected);
    expect(result.json().job.additional.some((field: { key: string; value: string }) => field.key === "schedule_display" && field.value.includes(label as string))).toBe(true);
  });
});
