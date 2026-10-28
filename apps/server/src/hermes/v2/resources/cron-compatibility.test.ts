import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";

describe("Cron-Kompatibilität mit nativen Jobs und Lauf-Sessions", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  beforeEach(async () => { f = await resourceFixture(); });
  afterEach(async () => { await f.close(); });

  it.each([null, undefined, ""])("verwaltet native Jobs ohne Projektarbeitsordner (%s)", async (workdir) => {
    f.jobs.set("job-1", f.job("job-1", { workdir }));
    const scope = await f.scope();
    for (const operation of ["resume", "trigger"] as const) {
      const response = await f.request("POST", `/cron/jobs/job-1/${operation}`, { scope, ...(operation === "trigger" ? { confirm: true } : {}) });
      expect(response.statusCode).toBe(200);
    }
    const updated = await f.request("PUT", "/cron/jobs/job-1", { scope, updates: { name: "Umbenannt" } });
    expect(updated.statusCode).toBe(200);
    expect(f.jobs.get("job-1")!.workdir).toBe(workdir);
    expect(f.writes).toHaveLength(3);
  });

  it("repariert einen unzulässigen Arbeitsordner durch eine explizite Projektwahl vor dem Fortsetzen", async () => {
    f.jobs.set("job-1", f.job("job-1", { workdir: "/etc", enabled: false }));
    const scope = await f.scope();
    const response = await f.request("PUT", "/cron/jobs/job-1", { scope, updates: { projectId: "wrapt", paused: false } });
    expect(response.statusCode).toBe(200);
    expect(f.writes.map((write) => write.body)).toEqual([{ updates: { workdir: f.root } }, undefined]);
    expect(f.jobs.get("job-1")!.workdir).toBe(f.root);
  });

  it("sendet nicht, wenn ein ungesetzter Arbeitsordner vor der Mutation einen anderen Wert erhält", async () => {
    f.jobs.set("job-1", f.job("job-1", { workdir: null }));
    const scope = await f.scope(); let details = 0;
    f.hook((method, path) => {
      if (method === "GET" && new URL(path, "http://fake").pathname === "/api/cron/jobs/job-1" && ++details === 2) return f.job("job-1", { workdir: "/etc" });
    });
    const response = await f.request("POST", "/cron/jobs/job-1/trigger", { scope, confirm: true });
    expect(response.statusCode).toBe(409);
    expect(f.writes).toHaveLength(0);
  });

  it("liefert nur nachgewiesene Sessionziele und behält Script-Ausgaben ohne Chat", async () => {
    const sessionId = "cron_job-1_20261026_053000";
    f.hook((method, path) => method === "GET" && new URL(path, "http://fake").pathname.endsWith("/runs") ? { runs: [
      { id: sessionId, source: "cron", profile: "default", started_at: 1_700_000_000, preview: "Antwort" },
      { id: "cron_output:job-1:2026-10-26_05-30-00", source: "cron_output", title: "FAILED · Skriptfehler" },
      { id: "cron_other_20261026", source: "cron" },
      { id: sessionId, source: "cron", profile: "other", preview: "Fremder Inhalt" },
      { id: sessionId },
    ] } : undefined);
    const response = await f.request("GET", "/cron/jobs/job-1/runs");
    expect(response.statusCode).toBe(200);
    expect(response.json().runs.map((run: { sessionId: string | null }) => run.sessionId)).toEqual([sessionId, null, null, null]);
    expect(response.json().runs[1].text).toBe("FAILED · Skriptfehler");
    expect(response.json().truncated).toBe(true);
    expect(response.body).not.toContain("Fremder Inhalt");
  });

  it("zeigt Zustellfehler als letzten Fehler und maskiert dessen Inhalt", async () => {
    f.jobs.set("job-1", f.job("job-1", { last_status: "delivery_failed", last_error: "älterer Ausführungsfehler", last_delivery_error: "Ziel nicht erreichbar" }));
    const response = await f.request("GET", "/cron/jobs/job-1");
    expect(response.statusCode).toBe(200);
    expect(response.json().job.lastError).toBe("Ziel nicht erreichbar");
  });

  it("behandelt HTTP 424 nach möglicher Speicherung als unbekannt statt sicher abgelehnt", async () => {
    const scope = await f.scope();
    f.hook((method) => { if (method === "POST") throw Object.assign(new Error("registration failed"), { status: 424 }); });
    const response = await f.request("POST", "/cron/jobs", { scope, name: "Neu", prompt: "Aufgabe", schedule: "every 30m", repeat: null, paused: false, projectId: "wrapt" });
    expect(response.statusCode).toBe(503);
    expect(response.json().outcome).toBe("unknown");
    expect(f.writes).toHaveLength(1);
  });

  it("bestätigt neue Jobs erst mit dem gesendeten Projektarbeitsordner", async () => {
    const scope = await f.scope();
    f.hook((method) => method === "POST" ? f.job("created", { workdir: "/etc" }) : undefined);
    const response = await f.request("POST", "/cron/jobs", { scope, name: "Neu", prompt: "Aufgabe", schedule: "every 30m", repeat: null, paused: false, projectId: "wrapt" });
    expect(response.json().outcome).toBe("unknown");
    expect(f.writes).toHaveLength(1);
  });

  it("erkennt weitere Laufhistorie mit einer zusätzlichen Zeile", async () => {
    f.hook((method, path) => method === "GET" && new URL(path, "http://fake").pathname.endsWith("/runs") ? { runs: [{ id: "a" }, { id: "b" }] } : undefined);
    const response = await f.request("GET", "/cron/jobs/job-1/runs?limit=1");
    expect(response.json().runs).toHaveLength(1);
    expect(response.json().truncated).toBe(true);
    expect(f.paths.some((path) => path.includes("/runs?limit=2&"))).toBe(true);
  });
});
