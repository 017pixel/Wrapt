import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayError } from "./errors.js";
import { clientMessage, securityFixture, type SecurityFixture } from "./security-test.fixture.js";

describe("Fortsetzen von Cron-Sitzungen und Wiederherstellung fehlgeschlagener Snapshots", () => {
  let f: SecurityFixture;
  beforeEach(async () => { f = await securityFixture(); });
  afterEach(async () => { vi.restoreAllMocks(); await f.close(); });

  const subscribe = (id: string) => f.manager.handle("tab", clientMessage({ op: "session.subscribe", sessionId: id }));
  const submit = (id: string) => f.manager.handle("tab", clientMessage({ op: "message.submit", sessionId: id, text: "Weiter" }));

  function storedCwd(id: string, cwd: string | null | undefined) {
    const read = f.deps.dashboard.get.bind(f.deps.dashboard);
    return vi.spyOn(f.deps.dashboard, "get").mockImplementation(async (path) => {
      const value = await read(path);
      return path === `/api/sessions/${id}` ? { ...value as object, cwd, source: "cron" } : value;
    });
  }

  it.each([null, undefined])("setzt Cron-Sitzungen mit gespeichertem CWD %s im geprüften Runtime-CWD fort", async (cwd) => {
    const session = f.gateway.seed("cron-run");
    storedCwd(session.id, cwd);
    await subscribe(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "session.subscribe", data: { snapshot: { writable: true, session: { cwd: f.root } } } });
    await submit(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "message.submit" });
    expect(f.gateway.calls.filter((call) => call.method === "prompt.submit")).toHaveLength(1);
  });

  it("lässt fehlendes gespeichertes CWD bei verbotenem Runtime-CWD ausschließlich lesbar", async () => {
    const session = f.gateway.seed("cron-outside");
    session.cwd = tmpdir();
    storedCwd(session.id, null);
    await subscribe(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "session.subscribe", data: { snapshot: { writable: false } } });
    await submit(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "PROJECT_FORBIDDEN" });
    expect(f.gateway.calls.some((call) => call.method === "prompt.submit")).toBe(false);
  });

  it("weist ein explizit verbotenes gespeichertes CWD weiterhin vor Resume zurück", async () => {
    const session = f.gateway.seed("cron-forbidden");
    storedCwd(session.id, tmpdir());
    await subscribe(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", data: { snapshot: { writable: false } } });
    expect(f.gateway.calls.some((call) => call.method === "session.resume")).toBe(false);
  });

  it("heilt einen fehlgeschlagenen ersten Snapshot beim bewussten erneuten Verbinden", async () => {
    const session = f.gateway.seed("snapshot-retry");
    const call = f.manager.upstream.call.bind(f.manager.upstream);
    let fail = true;
    vi.spyOn(f.manager.upstream, "call").mockImplementation((method, params, mutation) => {
      if (fail && method === "session.events.since") {
        fail = false;
        throw new GatewayError("SESSION_UNAVAILABLE", "Vorübergehender Lesefehler.", "not_sent", true);
      }
      return call(method, params, mutation);
    });
    await subscribe(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "error", code: "SESSION_UNAVAILABLE" });
    expect(f.manager.sessions.records.get(session.id)?.subscribers.size).toBe(0);
    await subscribe(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", data: { snapshot: { writable: true, blockedReason: null } } });
    await submit(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "message.submit" });
  });

  it("prüft bei erneutem Verbinden das inzwischen reparierte Runtime-CWD", async () => {
    const session = f.gateway.seed("cwd-repaired");
    session.cwd = tmpdir();
    storedCwd(session.id, null);
    await subscribe(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", data: { snapshot: { writable: false } } });
    session.cwd = f.root;
    await subscribe(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", data: { snapshot: { writable: true, blockedReason: null, session: { cwd: f.root } } } });
  });

  it("heilt ursprünglich nur lesbare Sitzungen auch ohne bestehende Live-Bindung", async () => {
    const session = f.gateway.seed("stored-repaired");
    const read = storedCwd(session.id, tmpdir());
    await subscribe(session.id);
    expect(f.manager.sessions.records.get(session.id)?.liveId).toBeNull();
    read.mockRestore();
    await subscribe(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", data: { snapshot: { writable: true, blockedReason: null } } });
    await submit(session.id);
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "message.submit" });
  });

  it.each(["omitted-lazy", "null-lazy", "changed-lazy", "omitted-live"] as const)("prüft Profilkontext bei %s Activate-Antwort", async (kind) => {
    const session = f.gateway.seed("profile-context");
    await subscribe(session.id);
    const record = f.manager.sessions.records.get(session.id)!;
    record.profileName = "default";
    const revision = record.contextRevision ?? 0;
    f.gateway.resultHook = (method, _params, value) => {
      if (method !== "session.activate") return value;
      const snapshot = value as { info: Record<string, unknown> };
      return { ...snapshot, info: { ...snapshot.info, lazy: kind !== "omitted-live",
        ...(kind === "null-lazy" ? { profile_name: null } : kind === "changed-lazy" ? { profile_name: "other" } : {}) } };
    };
    await f.manager.sessions.writable(record);
    expect(record.profileName).toBe(kind === "omitted-lazy" ? "default" : kind === "changed-lazy" ? "other" : null);
    expect(record.contextRevision ?? 0).toBe(revision + (kind === "omitted-lazy" ? 0 : 1));
  });

  it("behält das Create-Profil durch die echte lazy Activate-Teilantwort im ersten Snapshot", async () => {
    f.gateway.resultHook = (method, _params, value) => {
      if (method !== "session.create" && method !== "session.activate") return value;
      const snapshot = value as { info: Record<string, unknown> };
      return { ...snapshot, info: { ...snapshot.info, lazy: true, ...(method === "session.create" ? { profile_name: "default" } : {}) } };
    };
    await f.manager.handle("tab", clientMessage({ op: "session.create", projectId: null }));
    expect(f.messages.at(-1)).toMatchObject({ type: "result", op: "session.create", data: { snapshot: { writable: true } } });
    const record = [...f.manager.sessions.records.values()][0]!;
    expect(record.profileName).toBe("default");
    await f.manager.sessions.writable(record);
    expect(record.profileName).toBe("default");
  });
});
