import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hermesV2SummaryPageSchema, hermesV2OrganizationBatchSchema } from "@wrapt/contracts/hermes-v2";
import { integrationFixture } from "./integration-fixture.js";
import { rawRow } from "./test-fixture.js";

describe("Organisation am echten Domainadapter mit Fake-Core", () => {
  let f: Awaited<ReturnType<typeof integrationFixture>>;
  beforeEach(async () => { f = await integrationFixture(); });
  afterEach(async () => { await f.close(); });
  it("Konstruktion und unauthorisierte RESTaufrufe öffnen weder Datenbank noch Core", async () => {
    expect(f.pool.organization!.repo.opened).toBe(false);
    for (const request of [
      { method: "GET" as const, url: "/api/v1/hermes/v2/organization?sessionId=one", headers: {} },
      { method: "POST" as const, url: "/api/v1/hermes/v2/organization/action", headers: { "tailscale-user-login": "evil" }, payload: {} },
      { method: "POST" as const, url: "/api/v1/hermes/v2/organization/action", headers: { "tailscale-user-login": "a", origin: "https://evil.invalid", host: "workbench.test" }, payload: {} },
    ]) expect((await f.app.inject(request)).statusCode).toBeGreaterThanOrEqual(401);
    expect(f.paths).toEqual([]); expect(f.core.connections).toBe(0);
    expect(f.pool.organization!.repo.opened).toBe(false);
  });
  it("Subscribe-Snapshot trägt über ReplayTools und Zodkopie echten Beleg; Read vor Completion bleibt exakt", async () => {
    const session = f.core.seed("session"); session.messages = [rawRow(1)];
    const { manager, messages } = f.browser();
    await f.pool.organization!.context();
    await manager.handle("a", f.message({ op: "session.subscribe", sessionId: "session" }));
    const result = messages.find((frame) => frame.type === "result" && frame.op === "session.subscribe");
    if (result?.type !== "result" || result.op !== "session.subscribe") throw new Error("Subscribe fehlt");
    const token = result.data.snapshot.messages[0]!.readEvidence;
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const read = await f.request("/hermes/v2/organization/read", { sessionId: "session", evidence: [token] });
    expect(read.statusCode).toBe(200);
    f.core.event(session, "message.complete", { text: "Antwort 1", persisted_turn: { final_assistant_row_id: 1, complete: true } });
    await expect.poll(() => f.pool.organization!.repo.facts(f.pool.organization!.scopes.confirmed!.id, "session").length).toBe(1);
    const meta = hermesV2OrganizationBatchSchema.parse((await f.request("/hermes/v2/organization?sessionId=session")).json());
    expect(meta[0]!.attention.unreadCount).toBe(0);
  });
  it("alte Browser bekommen trotz gemeinsamem Manager keine readEvidence-Felder", async () => {
    const session = f.core.seed("session"); session.messages = [rawRow(1)];
    const newer = f.browser(); const old = f.browser("a", "legacy", false);
    await f.pool.organization!.context();
    await newer.manager.handle("a", f.message({ op: "session.subscribe", sessionId: "session" }));
    await old.manager.handle("legacy", f.message({ op: "session.subscribe", sessionId: "session" }));
    expect(JSON.stringify(newer.messages)).toContain("readEvidence");
    expect(JSON.stringify(old.messages)).not.toContain("readEvidence");
  });
  it("gemeinsame Fakten invalidieren Summary-only-B, ACK bleibt privat und Ownerbeleg ist nicht übertragbar", async () => {
    const session = f.core.seed("session");
    const a = f.browser(); const b = f.browser("b");
    await f.pool.organization!.context();
    await a.manager.handle("a", f.message({ op: "session.subscribe", sessionId: "session" }));
    await f.request("/hermes/v2/organization?sessionId=session");
    await f.request("/hermes/v2/organization?sessionId=session", undefined, "b");
    f.core.event(session, "message.complete", { text: "Antwort" });
    await expect.poll(() => b.messages.some((frame) => frame.type === "event" && frame.event.type === "metadata.invalidated")).toBe(true);
    const complete = a.messages.find((frame) => frame.type === "event" && frame.event.type === "message.completed");
    if (complete?.type !== "event" || complete.event.type !== "message.completed") throw new Error("Completion fehlt");
    const token = complete.event.payload.readEvidence;
    expect(token).toBeTruthy();
    expect((await f.request("/hermes/v2/organization/read", { sessionId: "session", evidence: [token] }, "b")).statusCode).toBe(400);
    const before = b.messages.length;
    expect((await f.request("/hermes/v2/organization/read", { sessionId: "session", evidence: [token] })).statusCode).toBe(200);
    expect(b.messages.length).toBe(before);
    const metaB = (await f.request("/hermes/v2/organization?sessionId=session", undefined, "b")).json();
    expect(metaB[0].attention.unreadCount).toBe(1);
  });
  it("REST-CAS, Undo und Members liefern strikte Shapes und vollständige private Grenzen", async () => {
    const created = await f.request("/hermes/v2/organization/action", { sessionId: "old-id", expectedRevision: 0, action: "pin" });
    expect(created.statusCode).toBe(200);
    expect(created.json().items).toHaveLength(1);
    const conflict = await f.request("/hermes/v2/organization/action", { sessionId: "old-id", expectedRevision: 0, action: "settle" });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: "ORGANIZATION_CONFLICT", items: [{ sessionId: "old-id" }] });
    const members = (await f.request("/hermes/v2/organization/members?group=pinned")).json();
    expect(members.items[0].sessionId).toBe("old-id");
    expect((await f.request("/hermes/v2/organization/members?group=pinned", undefined, "b")).json().items).toEqual([]);
    const lookup = await f.request("/hermes/v2/sessions/lookup", { sessionIds: ["old-id"] });
    expect(lookup.json().missingSessionIds).toEqual(["old-id"]);
    expect((await f.request("/hermes/v2/organization/undo", { handle: created.json().undo.handle })).statusCode).toBe(200);
  });
  it.each([
    ["/hermes/v2/sessions?profile=other", undefined], ["/hermes/v2/sessions?projectId=..%2Fetc", undefined],
    ["/hermes/v2/organization?sessionId=..%2Fetc", undefined],
    ["/hermes/v2/organization/read", { sessionId: "session", evidence: ["0".repeat(64)], owner: "b" }],
    ["/hermes/v2/sessions/lookup", { sessionIds: Array(101).fill("session") }],
  ] as const)("weist freie Profile/Owner/Traversal/Oversize vor Scopezugriff ab: %s", async (path, body) => {
    expect((await f.request(path, body)).statusCode).toBe(400);
    expect(f.paths).toEqual([]);
  });
  it("aktives CLIprofil wird nie als Dashboardcurrent übernommen; custom bleibt unbekannt", async () => {
    f.custom((path) => path === "/api/profiles/active" ? { active: "default", current: "custom" } : undefined);
    const result = await f.request("/hermes/v2/sessions");
    expect(result.statusCode).toBe(503);
    expect(f.paths.some((path) => path.startsWith("/api/profiles/sessions?"))).toBe(false);
    expect(f.pool.organization!.repo.opened).toBe(false);
  });
  it("Catalog nutzt read-only Profilroute, echte Offsetseite und ehrliche Teilabdeckung bei null Suchtreffern", async () => {
    for (let i = 0; i < 105; i++) { const session = f.core.seed(`id-${i}`); session.title = `Titel ${i}`; }
    const first = hermesV2SummaryPageSchema.parse((await f.request("/hermes/v2/sessions?limit=100&q=Titel%20104")).json());
    expect(first).toMatchObject({ sessions: [], nextOffset: 100, hasMore: true, coverage: "partial" });
    const next = hermesV2SummaryPageSchema.parse((await f.request("/hermes/v2/sessions?offset=100&limit=100&q=Titel%20104")).json());
    expect(next.sessions.map((row) => row.id)).toEqual(["id-104"]);
    expect(next).toMatchObject({ nextOffset: null, hasMore: false, coverage: "complete" });
    expect(f.paths.every((path) => !path.startsWith("/api/sessions?"))).toBe(true);
    expect(f.paths.filter((path) => path.startsWith("/api/profiles/sessions?")).every((path) => path.includes("profile=default"))).toBe(true);
    expect(next.activity["id-104"]).toMatchObject({ state: "unknown", turnStartedAt: null, subagentCount: null });
  });
});
