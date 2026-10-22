// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, activity, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Geordnete Summaryprojektionen und echte Abdeckungsgrenzen", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, gateway: TestGateway, rest: TestOrganization;
  const view = () => org.getView("one");
  const lookup = (id: string, title: string, waiting: boolean, delta = 0) => jsonResponse({ sessions: [{ ...snapshot(id).session, title }],
    activity: { [id]: activity({ state: waiting ? "waiting_input" : "idle", observedAt: now + delta }) }, missingSessionIds: [], serverNow: now + delta });
  const missing = (id: string) => jsonResponse({ sessions: [], activity: {}, missingSessionIds: [id], serverNow: now });
  const page = (title: string, waiting: boolean) => jsonResponse({ sessions: [{ ...snapshot().session, title }], activity: { a: activity({ state: waiting ? "waiting_input" : "idle" }) },
    offset: 0, limit: 100, nextOffset: null, hasMore: false, coverage: "complete", serverNow: now });
  async function mountOld() {
    rest.sessions = [...Array.from({ length: 100 }, (_, index) => snapshot(`s${index}`).session), snapshot("old").session];
    rest.items.set("old", metadata("old", { pinRank: 0 }));
    org.acquire({ ownerId: "one", active: true, visible: true });
    chat.acquire({ ownerId: "one", sessionId: "a", active: true, onSelectSession: vi.fn() }); await settle();
  }
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); rest = new TestOrganization();
    chat = new ChatRuntime(gateway.createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });

  it.each([0, 10])("behält frischen Lookup vor älterem Membershipread bei %i ms Abstand", async (delta) => {
    await mountOld(); let release!: (response: Response) => void, count = 0;
    rest.handle = (call) => call.path !== "sessions/lookup" ? null : ++count === 1
      ? new Promise((resolve) => { release = resolve; }) : lookup("old", "Frisch", true, delta);
    const older = view().refresh(); await settle();
    rest.items.set("old", metadata("old", { pinRank: 0, revision: 1 }));
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "old", revision: 1 }, "old")); await settle();
    release(lookup("old", "Alt", false)); await older;
    expect(view().rows.find((row) => row.id === "old")).toMatchObject({ title: "Frisch", group: "needs-input", activity: "waiting_input" });
  });
  it.each(["lookup", "catalog"] as const)("ordnet auch %s als alten Read gegenüber der anderen RESTquelle", async (olderKind) => {
    await mountOld(); let release!: (response: Response) => void;
    rest.handle = (call) => {
      const held = call.path === (olderKind === "lookup" ? "sessions/lookup" : "sessions");
      if (held) return new Promise((resolve) => { release = resolve; });
      return call.path === "sessions/lookup" ? lookup("a", "Frisch", true) : call.path === "sessions" ? page("Frisch", true) : null;
    };
    const older = olderKind === "lookup" ? org.queries.lookup(["a"], true) : org.queries.catalog(org.owners.get("one")!, true);
    if (olderKind === "lookup") await org.queries.catalog(org.owners.get("one")!, true);
    else await org.queries.lookup(["a"], true);
    release(olderKind === "lookup" ? lookup("a", "Alt", false) : page("Alt", false)); await older; org.emitAll();
    expect(view().rows.find((row) => row.id === "a")).toMatchObject({ title: "Frisch", group: "needs-input", activity: "waiting_input" });
  });
  it("entwertet fehlende Sessions samt Requestactivity, behält private Organisation und verhindert alte Wiederbelebung", async () => {
    rest.handle = (call) => call.path === "sessions/lookup" ? lookup("old", "Gelöscht", true) : null;
    await mountOld(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    const older = org.queries.lookup(["old"], true);
    rest.handle = (call) => call.path === "sessions/lookup" ? missing("old") : null;
    await org.queries.lookup(["old"], true); org.emitAll();
    expect(view().rows.find((row) => row.id === "old")).toMatchObject({ title: "old", missingSummary: true, activity: "unknown", requestCount: null, group: "pinned" });
    release(lookup("old", "Alt wiederbelebt", true)); await older; org.emitAll();
    expect(view().rows.find((row) => row.id === "old")).toMatchObject({ title: "old", missingSummary: true, activity: "unknown", pinned: true });
    expect(org.state.metadata.get("old")?.pinRank).toBe(0);
  });
  it("verwirft alte Missingantwort nach neuerem nativen Beleg und lässt echte Wiederverfügbarkeit zu", async () => {
    await mountOld(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    const oldMissing = org.queries.lookup(["old"], true);
    chat.upsertSummary({ ...snapshot("old").session, title: "Nativ neu" });
    release(missing("old")); await oldMissing; org.emitAll();
    expect(view().rows.find((row) => row.id === "old")).toMatchObject({ title: "Nativ neu", missingSummary: false });
    rest.handle = (call) => call.path === "sessions/lookup" ? missing("old") : null;
    await org.queries.lookup(["old"], true);
    rest.handle = (call) => call.path === "sessions/lookup" ? lookup("old", "Wieder verfügbar", false) : null;
    await org.queries.lookup(["old"], true); org.emitAll();
    expect(view().rows.find((row) => row.id === "old")).toMatchObject({ title: "Wieder verfügbar", missingSummary: false, activity: "idle" });
  });
  it("kennzeichnet fehlende Activity einer erneuerten Summary als unbekannt statt alten Request zu behalten", async () => {
    rest.handle = (call) => call.path === "sessions/lookup" ? lookup("old", "Vorher", true) : null;
    await mountOld();
    rest.handle = (call) => call.path === "sessions/lookup" ? jsonResponse({ sessions: [snapshot("old").session], activity: {}, missingSessionIds: [], serverNow: now }) : null;
    await org.queries.lookup(["old"], true); org.emitAll();
    expect(view().rows.find((row) => row.id === "old")).toMatchObject({ activity: "unknown", requestCount: null, group: "pinned" });
  });
  it("verlangt eine vollständige eindeutige Lookup-Partition aus Rows und Missing-IDs", async () => {
    for (const result of [
      { sessions: [snapshot().session], missingSessionIds: ["a"] },
      { sessions: [], missingSessionIds: [] },
      { sessions: [], missingSessionIds: ["b"] },
    ]) {
      const client = new OrganizationClient(async () => jsonResponse({ ...result, activity: {}, serverNow: now }));
      await expect(client.lookup(["a"], new AbortController().signal)).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    }
  });
  it("übernimmt echte letzte Rows bei terminaler partieller 5000er-Seite ohne weitere Requests", async () => {
    rest.handle = (call) => {
      if (call.path !== "sessions") return null;
      const offset = Number(call.query.get("offset"));
      return jsonResponse({ sessions: offset === 4900 ? [snapshot("last").session] : [], activity: {}, offset, limit: 100,
        nextOffset: offset === 4900 ? null : offset + 100, hasMore: true, coverage: "partial", serverNow: now });
    };
    await mountOld();
    for (let index = 0; index < 49; index++) await view().loadMore();
    expect(view().error).toBeNull(); expect(view().search).toMatchObject({ hasMore: false, nextOffset: null, partial: true, limitReached: true });
    expect(view().rows.some((row) => row.id === "last")).toBe(true);
    const count = rest.calls.length; await view().loadMore(); expect(rest.calls).toHaveLength(count);
  });
  it("weist fehlenden Fortschritt vor der Grenze und widersprüchliche vollständige Limitseite ab", async () => {
    for (const [offset, coverage] of [[4800, "partial"], [4900, "complete"]] as const) {
      const client = new OrganizationClient(async () => jsonResponse({ sessions: [], activity: {}, offset, limit: 100,
        nextOffset: null, hasMore: true, coverage, serverNow: now }));
      await expect(client.catalog({ offset, limit: 100 }, new AbortController().signal)).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    }
  });
});
