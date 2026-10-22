import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resourceFixture } from "./resource.fixture.js";
import { randomUUID } from "node:crypto";

describe("Bestätigtes natives V2-Sitzungsdelete", () => {
  let f: Awaited<ReturnType<typeof resourceFixture>>;
  const id = "full-stored-session-123";
  beforeEach(async () => { f = await resourceFixture(); f.stored.set(id, { id, profile: "default", cwd: f.root, title: "Eigene Sitzung", started_at: 1_700_000_000 }); });
  afterEach(async () => { await f.close(); });
  async function online() { const browser = f.browser(); browser.manager.connections.get(browser.id)!.resources = true; await browser.manager.upstream.connect(); expect(browser.manager.upstream.state).toBe("online"); return browser; }
  const preview = () => f.request("GET", `/sessions/${id}/deletion`);
  const remove = (scope: string, owner = "a") => f.request("DELETE", `/sessions/${id}`, { scope, confirm: "delete-compression-chain" }, owner);
  it("bestätigt ohne Chatlease nur post-read fehlende volle ID und invalidiert den Katalog", async () => {
    const browser = await online(); const before = await preview(); expect(before.statusCode).toBe(200); expect(before.json().deletable).toBe(true);
    expect(browser.manager.sessions.records.size).toBe(0); const response = await remove(before.json().scope);
    expect(response.statusCode).toBe(200); expect(response.json()).toEqual({ scope: before.json().scope, outcome: "confirmed", requestedSessionId: id, alreadyAbsent: false, confirmedAbsentSessionIds: [id], affectedIdsComplete: false, effect: "compression-chain" });
    expect(f.writes).toHaveLength(1); expect(browser.messages.some((frame) => frame.type === "event" && frame.event.type === "sessions.invalidated")).toBe(true);
    expect(browser.messages.some((frame) => frame.type === "event" && frame.event.type === "resources.invalidated" && frame.event.payload.resource === "sessions")).toBe(true);
    expect(f.core.calls.some((call) => ["session.resume", "session.activate", "session.create", "session.interrupt", "session.close"].includes(call.method))).toBe(false);
  });
  it("bleibt ohne vorhandene Onlineverbindung ehrlich nicht löschbar", async () => {
    const before = (await preview()).json(); expect(before.deletable).toBe(false); expect(f.pool.existing()).toHaveLength(0);
    expect((await remove(before.scope)).statusCode).toBe(409); expect(f.writes).toHaveLength(0);
  });
  it("verlangt echte Owner/ID-Vorschau, bestätigt Scope stabil und verbraucht sie genau einmal", async () => {
    await online(); const scope = await f.scope(); expect((await remove(scope)).statusCode).toBe(409);
    const first = (await preview()).json(); const second = (await preview()).json(); expect(first.scope).toBe(second.scope);
    expect((await remove(first.scope, "b")).statusCode).toBe(409); expect(f.writes).toHaveLength(0);
    expect((await remove(first.scope)).statusCode).toBe(200); expect((await remove(first.scope)).statusCode).toBe(409); expect(f.writes).toHaveLength(1);
  });
  it("lässt natives ok ohne echte Abwesenheit unknown und wiederholt nicht", async () => {
    await online(); const scope = (await preview()).json().scope; f.hook((method) => method === "DELETE" ? { ok: true } : undefined);
    const response = await remove(scope); expect(response.statusCode).toBe(503); expect(response.json().outcome).toBe("unknown"); expect(f.stored.has(id)).toBe(true); expect(f.writes).toHaveLength(1);
  });
  it("behält native409 und Transportverlust ohne Cleanup oder Retry", async () => {
    await online(); let scope = (await preview()).json().scope;
    f.hook((method) => { if (method === "DELETE") throw Object.assign(new Error(), { status: 409 }); });
    const response = await remove(scope); expect(response.statusCode).toBe(409); expect(response.json().outcome).toBe("rejected"); expect(f.stored.has(id)).toBe(true);
    scope = (await preview()).json().scope; f.hook((method) => { if (method === "DELETE") throw new Error(); });
    expect((await remove(scope)).json().outcome).toBe("unknown"); expect(f.writes).toHaveLength(2);
  });
  it("schützt aktive Ketten- oder Delegatebelege und offene Requests vor jedem Send", async () => {
    await online(); const child = f.core.seed("delegated-child"); child.running = true;
    expect((await preview()).json().deletable).toBe(false); expect(f.writes).toHaveLength(0);
    child.running = false; child.requests.push({ id: "srq-child", method: "clarify.ask", params: {} });
    expect((await preview()).json().deletable).toBe(false); expect(f.writes).toHaveLength(0);
  });
  it("prüft neue aktive Belege nach Vorschau vor dem echten Send erneut", async () => {
    await online(); const scope = (await preview()).json().scope; f.core.seed("compression-peer").running = true;
    expect((await remove(scope)).statusCode).toBe(409); expect(f.writes).toHaveLength(0);
  });
  it.each(["empty", "stats", "search", "bulk-delete"])("sperrt reservierte Route %s ohne native Weiterleitung", async (reserved) => {
    const response = await f.request("DELETE", `/sessions/${reserved}`, { scope: "a".repeat(64), confirm: "delete-compression-chain" });
    expect(response.statusCode).toBe(400); expect(f.writes).toHaveLength(0); expect(f.paths).toHaveLength(0);
  });
  it("akzeptiert keine native Prefixauflösung und keine ausgetauschte volle Zielidentität", async () => {
    await online(); f.hook((method, path) => method === "GET" && new URL(path, "http://fake").pathname === `/api/sessions/${id}` ? { id: `${id}-longer`, profile: "default", cwd: f.root } : undefined);
    expect((await preview()).statusCode).toBe(404); expect(f.writes).toHaveLength(0);
    f.hook(undefined); const scope = (await preview()).json().scope; f.stored.get(id)!.cwd = `${f.root}/changed`;
    expect((await remove(scope)).statusCode).toBe(409); expect(f.writes).toHaveLength(0);
  });
  it("behält fremde Branch-IDs außerhalb bestätigter Cleanupmenge", async () => {
    await online(); const branch = `${id}-branch`; f.stored.set(branch, { id: branch, profile: "default", cwd: f.root });
    const scope = (await preview()).json().scope; const response = await remove(scope);
    expect(response.statusCode).toBe(200); expect(f.stored.has(branch)).toBe(true); expect(response.json().confirmedAbsentSessionIds).not.toContain(branch);
  });
  it("bereinigt genau inaktive eigene Leases und erhält dieselbe ID eines anderen Profils", async () => {
    const browser = await online(); f.core.seed(id);
    await browser.manager.handle(browser.id, { v: 1, id: randomUUID(), op: "session.subscribe", sessionId: id });
    const record = browser.manager.sessions.records.get(id)!; expect(record.profileName).toBe("default"); expect(record.backgroundActive).toBe(false);
    const other = f.pool.get("b"); const foreign = { ...record, profileName: "other", subscribers: new Set<string>() }; other.sessions.records.set(id, foreign);
    const scope = (await preview()).json().scope; const response = await remove(scope);
    expect(response.statusCode).toBe(200); expect(browser.manager.sessions.records.has(id)).toBe(false); expect(other.sessions.records.get(id)).toBe(foreign);
    expect(browser.manager.subscriptions.get(browser.id, id)).toBeUndefined();
    expect(f.core.calls.some((call) => ["session.interrupt", "session.close"].includes(call.method))).toBe(false);
  });
  it("bestätigt natives already_absent erst nach tatsächlicher Abwesenheit", async () => {
    await online(); const scope = (await preview()).json().scope;
    f.hook((method) => { if (method === "DELETE") { f.stored.delete(id); return { ok: true, already_absent: true }; } });
    const response = await remove(scope); expect(response.statusCode).toBe(200); expect(response.json().alreadyAbsent).toBe(true); expect(response.json().confirmedAbsentSessionIds).toEqual([id]);
  });
});
