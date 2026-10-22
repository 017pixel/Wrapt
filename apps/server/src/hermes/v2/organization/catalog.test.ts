import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { integrationFixture } from "./integration-fixture.js";
import { rawRow } from "./test-fixture.js";
import { organizationPolicy } from "./policy.js";

describe("begrenzte Summary-/Activityprojektion", () => {
  let f: Awaited<ReturnType<typeof integrationFixture>>;
  beforeEach(async () => { f = await integrationFixture(); });
  afterEach(async () => { await f.close(); });
  it("20 Working-Summaries mit Profilzeugen benötigen keine Chatabos, Resumes oder Agentstarts", async () => {
    const sessions = Array.from({ length: 20 }, (_, i) => f.core.seed(`session-${i}`));
    for (const session of sessions) {
      session.running = true;
      session.events.push({ type: "session.info", session_id: session.liveId, seq: ++session.seq,
        payload: { profile_name: "default", stored_session_id: session.id, turn_started_at: 1_800_000_000 } });
    }
    const browser = f.browser(); await f.pool.organization!.context(); await browser.manager.upstream.connect();
    const result = await f.request("/hermes/v2/sessions");
    expect(result.statusCode).toBe(200);
    const activity = result.json().activity;
    expect(Object.values(activity)).toHaveLength(20);
    for (const value of Object.values(activity)) expect(value).toMatchObject({ state: "working", turnStartedAt: 1_800_000_000_000,
      subagentCount: null, backgroundCount: null, openRequestCount: 0, coverage: "observed" });
    expect(f.core.calls.some((call) => ["session.resume", "session.activate", "session.status", "subagent.list"].includes(call.method))).toBe(false);
    expect([...f.core.viewers.values()].every((viewers) => viewers.size === 0)).toBe(true);
  });
  it("Stored-ID ohne Profilbeleg ist unknown; waiting mit echtem Profilbeleg ist Needsinput ohne erfundene Zahlen", async () => {
    const session = f.core.seed("session");
    const browser = f.browser(); await f.pool.organization!.context(); await browser.manager.upstream.connect();
    const hook = f.core.resultHook;
    f.core.resultHook = (method, params, value) => method === "session.active_list"
      ? { sessions: [{ id: session.liveId, session_key: session.id, status: "waiting", started_at: 1 }] } : hook!(method, params, value);
    let body = (await f.request("/hermes/v2/sessions")).json();
    expect(body.activity.session).toMatchObject({ state: "unknown", turnStartedAt: null, openRequestCount: null });
    session.events.push({ type: "session.info", session_id: session.liveId, seq: ++session.seq, payload: { profile_name: "other", stored_session_id: "session" } });
    body = (await f.request("/hermes/v2/sessions")).json();
    expect(body.activity.session.state).toBe("unknown");
    session.events.push({ type: "session.info", session_id: session.liveId, seq: ++session.seq, payload: { profile_name: "default", stored_session_id: "session" } });
    session.requests = [{ id: "srq-approval", method: "approval", params: { session_id: session.liveId, command: "echo ok" } }];
    body = (await f.request("/hermes/v2/sessions")).json();
    expect(body.activity.session).toMatchObject({ state: "waiting_input", openRequestCount: 1, turnStartedAt: null });
    expect(browser.manager.sessions.records.size).toBe(0);
    expect(f.core.responses).toEqual([]);
    const view = (await f.request("/hermes/v2/organization?sessionId=session")).json()[0];
    const snooze = await f.request("/hermes/v2/organization/action", { sessionId: "session", expectedRevision: view.revision, action: "snooze", snoozedUntil: Date.now() + 3600_000 });
    expect(snooze.statusCode).toBe(409);
    expect(snooze.json().code).toBe("OPEN_REQUEST");
  });
  it("bereits profilgebundener Record verwendet Snapshot/Requests statt erneutem Token-Replay", async () => {
    const session = f.core.seed("session"); session.running = true;
    const { manager } = f.browser(); await f.pool.organization!.context();
    await manager.handle("a", f.message({ op: "session.subscribe", sessionId: "session" }));
    const before = f.core.calls.filter((call) => call.method === "session.events.since").length;
    const result = (await f.request("/hermes/v2/sessions")).json();
    expect(result.activity.session.state).toBe("working");
    expect(f.core.calls.filter((call) => call.method === "session.events.since")).toHaveLength(before);
  });
  it("native Pinbackfills vergrößern weder Browserseite noch nächsten Offset", async () => {
    f.custom((path) => path.startsWith("/api/profiles/sessions?") ? { sessions: Array.from({ length: 150 }, (_, i) => ({ id: `id-${i}`, title: `Titel ${i}`, profile: "default" })), total: 500 } : undefined);
    const response = (await f.request("/hermes/v2/sessions?limit=100")).json();
    expect(response.sessions).toHaveLength(100);
    expect(response.nextOffset).toBe(100);
    expect(response.hasMore).toBe(true);
    expect(response.coverage).toBe("partial");
  });
  it("Katalogtiefe5000 stoppt weitere native Scans ehrlich mit Teilabdeckung", async () => {
    f.custom((path) => path.startsWith("/api/profiles/sessions?") ? { sessions: [], total: 10_000 } : undefined);
    const last = (await f.request("/hermes/v2/sessions?offset=4900&limit=100")).json();
    expect(last).toMatchObject({ nextOffset: null, hasMore: true, coverage: "partial" });
    const before = f.paths.length;
    expect((await f.request("/hermes/v2/sessions?offset=5000")).json().coverage).toBe("partial");
    expect(f.paths.length).toBe(before);
  });
  it("4MiB-Grenze und defekte Profile/Storage ergeben keine scheinbar leere vollständige Liste", async () => {
    f.custom((path) => path.startsWith("/api/profiles/sessions?") ? { sessions: [], total: 0, padding: "x".repeat(organizationPolicy.httpBytes) } : undefined);
    expect((await f.request("/hermes/v2/sessions")).statusCode).toBe(502);
    f.custom((path) => path.startsWith("/api/profiles/sessions?") ? { sessions: [], total: 0, storage: { default: "corrupt" } } : undefined);
    expect((await f.request("/hermes/v2/sessions")).statusCode).toBe(503);
  });
  it("Lookup verwendet zwei Reader und verrät keine fremdprofiligen oder nicht existierenden IDs", async () => {
    let inflight = 0; let peak = 0;
    f.custom(async (path) => {
      if (!path.startsWith("/api/sessions/")) return undefined;
      inflight++; peak = Math.max(peak, inflight); await new Promise((resolve) => setTimeout(resolve, 1)); inflight--;
      const id = new URL(path, "http://fake").pathname.split("/").at(-1)!;
      return { id, profile: id === "foreign" ? "other" : "default", title: id };
    });
    const result = (await f.request("/hermes/v2/sessions/lookup", { sessionIds: ["one", "two", "three", "foreign"] })).json();
    expect(peak).toBe(2);
    expect(result.sessions.map((row: { id: string }) => row.id)).toEqual(["one", "two", "three"]);
    expect(result.missingSessionIds).toEqual(["foreign"]);
    expect(f.paths.filter((path) => path.startsWith("/api/sessions/")).every((path) => path.includes("profile=default"))).toBe(true);
  });
  it("serverseitiger Projektfilter und Titel-/ID-/CWD-Seitensuche erlauben keinen freien Pfad", async () => {
    const one = f.core.seed("first"); one.title = "Gesucht";
    const two = f.core.seed("second"); two.cwd = `${f.root}-unrelated`;
    const response = (await f.request("/hermes/v2/sessions?projectId=known&q=gesuch")).json();
    expect(response.sessions.map((row: { id: string }) => row.id)).toEqual(["first"]);
    expect(response.sessions[0].projectId).toBe("known");
    expect((await f.request("/hermes/v2/sessions?cwd=/etc")).statusCode).toBe(400);
  });
  it("bekannte Secrets bleiben auch in neuen REST-Summaries feldbewusst maskiert", async () => {
    const session = f.core.seed("session"); session.title = "a once";
    const { manager } = f.browser(); await f.pool.organization!.context();
    manager.secrets.remember("a"); manager.secrets.remember("once");
    const response = (await f.request("/hermes/v2/sessions")).json();
    expect(response.sessions[0].title).not.toContain("once");
    expect(response.sessions[0].id).toBe("session");
    expect(response.activity.session.state).toBe("unknown");
    expect(response.coverage).toBe("complete");
  });
  it("Epochverlust ohne Row-Zeugen projiziert nur Lücke, Fehlernotice bleibt frisch lesbar ohne Antwort-/Request-ACK", async () => {
    const session = f.core.seed("session");
    const { manager } = f.browser(); await f.pool.organization!.context();
    await manager.handle("a", f.message({ op: "session.subscribe", sessionId: "session" }));
    f.core.event(session, "message.complete", { text: "Nur flüchtige Antwort" });
    f.core.event(session, "error", { message: "Originalfehler wird nicht gespeichert" });
    await expect.poll(() => f.pool.organization!.repo.facts(f.pool.organization!.scopes.confirmed!.id, "session").length).toBe(2);
    f.pool.organization!.evidence.clear();
    f.pool.organization!.epoch("next-epoch");
    const notices = (await f.request("/hermes/v2/organization/notices?sessionId=session")).json();
    expect(notices.items.find((item: { kind: string }) => item.kind === "unavailable-content")).toMatchObject({ readEvidence: null });
    const error = notices.items.find((item: { kind: string }) => item.kind === "historical-decision-error");
    expect(error.readEvidence).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(notices)).not.toContain("Originalfehler");
    expect((await f.request("/hermes/v2/organization/read", { sessionId: "session", evidence: [error.readEvidence] })).statusCode).toBe(200);
    expect(f.core.responses).toEqual([]);
    expect((await f.request("/hermes/v2/organization?sessionId=session")).json()[0].attention.unreadCount).toBe(0);
    expect((await f.request("/hermes/v2/organization?sessionId=session")).json()[0].coverage.state).toBe("gap");
  });
  it("stärkerer expliziter Livebeleg derselben gespeicherten Antwort erzeugt nach Settle keinen zweiten Wake", async () => {
    const session = f.core.seed("session"); session.messages = [rawRow(1)];
    const { manager } = f.browser(); await f.pool.organization!.context();
    await manager.handle("a", f.message({ op: "session.subscribe", sessionId: "session" }));
    const scope = f.pool.organization!.scopes.confirmed!;
    f.pool.organization!.repo.transaction(() => f.pool.organization!.repo.fact(f.pool.organization!.repo.source(scope.id, "session", "answer", `uid:${rawRow(1).message_uid}`), "new-answer", Date.now()));
    const before = (await f.request("/hermes/v2/organization?sessionId=session")).json()[0];
    await f.request("/hermes/v2/organization/action", { sessionId: "session", expectedRevision: before.revision, action: "settle" });
    f.core.event(session, "message.complete", { text: "Antwort 1", persisted_turn: { final_assistant_row_id: 1, complete: true } });
    await expect.poll(() => f.pool.organization!.repo.facts(scope.id, "session")[0]?.kind).toBe("live-turn-end");
    const after = (await f.request("/hermes/v2/organization?sessionId=session")).json()[0];
    expect(after.effectiveSettledAt).not.toBeNull();
    expect(after.attention.requiresAttention).toBe(false);
    expect(f.pool.organization!.repo.facts(scope.id, "session")).toHaveLength(1);
  });
});
