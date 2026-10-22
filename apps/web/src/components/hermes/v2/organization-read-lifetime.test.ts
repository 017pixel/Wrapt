// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Ursprüngliche Lebensdauer zusammengesetzter Organisationsreads", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, rest: TestOrganization, gateway: TestGateway;
  const options = { ownerId: "one", active: true, visible: true };
  const mount = async () => { org.acquire(options); await settle(); };
  const offOn = () => { useAppPreferences.setState({ hermesV2Enabled: false }); useAppPreferences.setState({ hermesV2Enabled: true }); org.acquire(options); };
  const response = (ids: string[]) => jsonResponse(ids.map((id) => metadata(id, { revision: 99, pinRank: 0 })));
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); rest = new TestOrganization(); gateway = new TestGateway();
    chat = new ChatRuntime(gateway.createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch)); await mount();
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("verwirft wartenden Freshread nach Off/On bei Promisegrenze %i", async (steps) => {
    rest.handle = (call) => call.path === "organization" ? response(call.query.getAll("sessionId")) : null;
    const pending = Promise.allSettled([org.queries.metadata(["old-only"]), org.queries.metadata(["old-only"], true)]);
    for (let index = 0; index < steps; index++) await Promise.resolve();
    offOn(); const cut = rest.calls.length; await pending; await settle();
    expect(rest.calls.slice(cut).some((call) => call.path === "organization" && call.query.getAll("sessionId").includes("old-only"))).toBe(false);
    expect(org.state.metadata.has("old-only")).toBe(false);
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("startet nach alter Invalidierungsmetadatenantwort keinen neuen Lookup, Grenze %i", async (steps) => {
    chat.acquire({ ...options, sessionId: "other", onSelectSession: vi.fn() }); await settle(); rest.sessions = [];
    rest.handle = (call) => call.path === "organization" ? response(call.query.getAll("sessionId")) : null;
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "old-only", revision: 99 }, "old-only"));
    for (let index = 0; index < steps; index++) await Promise.resolve();
    offOn(); const cut = rest.calls.length; await settle(); await settle();
    expect(rest.calls.slice(cut).some((call) => call.path === "sessions/lookup" && (call.body?.sessionIds as string[]).includes("old-only"))).toBe(false);
    expect(org.state.metadata.has("old-only")).toBe(false);
  });
  it("stoppt Refresh nach altem abgebrochenem Katalog und nach gehaltener Membershipantwort", async () => {
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions" ? new Promise((resolve) => { release = resolve; }) : null;
    const first = org.getView("one").refresh(); rest.handle = null; offOn(); await settle(); const cut = rest.calls.length;
    release(jsonResponse({ sessions: [], activity: {}, offset: 0, limit: 100, nextOffset: null, hasMore: false, coverage: "complete", serverNow: now }));
    await first; expect(rest.calls).toHaveLength(cut);
    rest.handle = (call) => call.path === "organization/members" ? new Promise((resolve) => { release = resolve; }) : null;
    const second = org.getView("one").refresh(); await settle(); rest.handle = null; offOn(); await settle(); const secondCut = rest.calls.length;
    release(jsonResponse({ group: "pinned", items: [], nextCursor: null, hasMore: false, pinRevision: 0, membershipRevision: 0, serverNow: now }));
    await second; expect(rest.calls).toHaveLength(secondCut);
  });
  it("stoppt Refresh nach neuer Suchgeneration auch ohne Flagwechsel", async () => {
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions" && !call.query.get("q") ? new Promise((resolve) => { release = resolve; }) : null;
    const old = org.getView("one").refresh(); org.getView("one").setQuery("neu"); await settle(); const cut = rest.calls.length;
    release(jsonResponse({ sessions: [], activity: {}, offset: 0, limit: 100, nextOffset: null, hasMore: false, coverage: "complete", serverNow: now }));
    await old; expect(rest.calls).toHaveLength(cut);
  });
  it("hält native Metadaten plus wartende Invalidierung im ursprünglichen Zyklus", async () => {
    chat.acquire({ ...options, sessionId: "other", onSelectSession: vi.fn() }); await settle(); rest.sessions = [];
    rest.handle = (call) => call.path === "organization" ? response(call.query.getAll("sessionId")) : null;
    chat.upsertSummary(snapshot("old-only").session);
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "old-only", revision: 99 }, "old-only"));
    for (let index = 0; index < 6; index++) await Promise.resolve();
    offOn(); const cut = rest.calls.length; await settle(); await settle();
    expect(rest.calls.slice(cut).some((call) => call.path === "organization" && call.query.getAll("sessionId").includes("old-only"))).toBe(false);
    expect(org.state.metadata.has("old-only")).toBe(false);
  });
  it("führt einen gültigen Freshread weiterhin einmal aus und beendet eine ownergebundene Lookup-Batchkette", async () => {
    rest.handle = (call) => call.path === "organization" ? response(call.query.getAll("sessionId")) : null;
    await Promise.all([org.queries.metadata(["fresh"]), org.queries.metadata(["fresh"], true)]);
    expect(rest.calls.filter((call) => call.path === "organization" && call.query.getAll("sessionId").includes("fresh"))).toHaveLength(2);
    org.acquire({ ownerId: "other" }); const releaseOwner = org.acquire(options); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    const ids = Array.from({ length: 101 }, (_, index) => `s${index}`), valid = org.capture(org.owners.get("one")!);
    const pending = org.queries.lookup(ids, true, valid); releaseOwner(); await settle(); const cut = rest.calls.length;
    release(jsonResponse({ sessions: [], activity: {}, missingSessionIds: ids.slice(0, 100), serverNow: now }));
    await pending; expect(rest.calls).toHaveLength(cut); expect(org.state.sessions.has("s100")).toBe(false);
  });
});
