import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { integrationFixture } from "../organization/integration-fixture.js";
import { object } from "../normalize-values.js";

export async function resourceFixture() {
  const fixture = await integrationFixture();
  await mkdir(join(fixture.root, "memories"));
  await mkdir(join(fixture.root, "pending/memory"), { recursive: true });
  await mkdir(join(fixture.root, "pending/skills"), { recursive: true });
  const jobs = new Map<string, Record<string, unknown>>();
  const stored = new Map<string, Record<string, unknown>>();
  const skills: Record<string, unknown>[] = [{ name: "test-skill", description: "Test", enabled: true, usage: 2, provenance: "bundled" }];
  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  let hook: ((method: string, path: string, body?: unknown) => unknown | Promise<unknown>) | undefined;
  let active = "default"; let skillContent = "# Test";
  const job = (id = "job-1", extra: Record<string, unknown> = {}) => ({ id, name: "Testjob", prompt: "Aufgabe", schedule: { kind: "cron", expr: "0 8 * * *" }, schedule_display: "0 8 * * *", repeat: { times: null, completed: 2 },
    enabled: true, workdir: fixture.root, no_agent: false, profile: "default", ...extra });
  jobs.set("job-1", job());
  const native = async (method: string, path: string, body?: unknown): Promise<unknown> => {
    const result = await hook?.(method, path, body); if (result !== undefined) return result;
    const url = new URL(path, "http://fake"); const parts = url.pathname.split("/"); const id = decodeURIComponent(parts[4] ?? "");
    if (url.pathname === "/api/profiles/active") return { current: active };
    if (url.pathname === "/api/profiles") return { profiles: [{ name: "default", path: fixture.root }, { name: "other", path: join(fixture.root, "other") }] };
    if (url.pathname === "/api/cron/jobs") {
      if (method === "GET") return [...jobs.values()];
      const input = object(body); const created = job("created", { ...input, enabled: !input.paused }); jobs.set("created", created); return created;
    }
    if (url.pathname.startsWith("/api/cron/jobs/")) {
      const current = jobs.get(id); if (!current) throw Object.assign(new Error("nicht gefunden"), { status: 404 });
      if (method === "GET") return parts[5] === "runs" ? { runs: [{ id: "run-1", started_at: 1_700_000_000, status: "success", preview: "Lauftext" }] } : current;
      if (method === "DELETE") { jobs.delete(id); return { ok: true }; }
      if (method === "PUT") Object.assign(current, object(object(body).updates));
      if (parts[5] === "pause") current.enabled = false;
      if (["resume", "trigger"].includes(parts[5] ?? "")) current.enabled = true;
      return current;
    }
    if (url.pathname === "/api/memory") return { active: "builtin", providers: [{ name: "external", available: true, configured: true, setup: { credentials: "private-value" } }] };
    if (url.pathname === "/api/skills") return skills;
    if (url.pathname === "/api/skills/content") return { name: url.searchParams.get("name"), content: skillContent, path: "/private/ignored" };
    if (url.pathname === "/api/status") return { version: "1.0", gateway_state: "running" };
    if (url.pathname === "/api/logs") return { lines: ["Agent bereit"] };
    if (url.pathname.startsWith("/api/sessions/") && !url.pathname.endsWith("/messages")) {
      const sessionId = decodeURIComponent(parts[3] ?? ""); const current = stored.get(sessionId);
      if (!current) throw Object.assign(new Error("nicht gefunden"), { status: 404 });
      if (url.pathname.endsWith("/latest-descendant")) return { requested_session_id: sessionId, session_id: sessionId, path: [sessionId], changed: false };
      if (method === "DELETE") { stored.delete(sessionId); return { ok: true }; }
      return current;
    }
    return undefined;
  };
  fixture.custom((path) => native("GET", path));
  const write = (method: string) => async (path: string, body?: unknown) => { writes.push({ method, path, body }); return native(method, path, body); };
  fixture.deps.resources = { writer: { post: write("POST"), put: write("PUT"), delete: write("DELETE") }, readUpdateStatus: () => ({ phase: "idle", logTail: [] }) };
  const request = (method: "GET" | "POST" | "PUT" | "DELETE", path: string, payload?: unknown, owner = "a", origin = "http://workbench.test") => fixture.app.inject({ method, url: `/api/v1/hermes/v2${path}`,
    headers: { host: "workbench.test", origin, "tailscale-user-login": owner }, ...(payload === undefined ? {} : { payload: payload as object }) });
  return { ...fixture, request, jobs, stored, skills, writes, job, hook: (fn: typeof hook) => { hook = fn; }, profile: (name: string) => { active = name; },
    content: (value: string) => { skillContent = value; }, scope: async () => (await request("GET", "/cron/jobs")).json().scope as string };
}
