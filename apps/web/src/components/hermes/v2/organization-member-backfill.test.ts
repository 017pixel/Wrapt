// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, activity, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Membershipseite mit vollständig abgeschlossenem Summarybackfill", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, rest: TestOrganization;
  const first = { ownerId: "one" }, second = { ownerId: "other" };
  const ids = Array.from({ length: 101 }, (_, index) => `pin-${index}`);
  const pins = ids.map((id, index) => metadata(id, { pinRank: index }));
  const memberCalls = () => rest.calls.filter((call) => call.path === "organization/members" && call.query.get("group") === "pinned");
  const lookupCalls = () => rest.calls.filter((call) => call.path === "sessions/lookup");
  const page = (last: boolean) => jsonResponse({ group: "pinned", items: last ? pins.slice(100) : pins.slice(0, 100),
    hasMore: !last, nextCursor: last ? null : "second", membershipRevision: 0, pinRevision: 0, serverNow: now });
  const summaries = (requested: string[], waiting = true) => jsonResponse({
    sessions: requested.map((id) => ({ ...snapshot(id).session, title: waiting ? "Offene Anfrage" : "Alter Stand" })),
    activity: Object.fromEntries(requested.map((id) => [id, activity({ state: waiting ? "waiting_input" : "idle", openRequestCount: waiting ? 1 : 0 })])),
    missingSessionIds: [], serverNow: now,
  });
  const respond = (call: TestOrganization["calls"][number]) => {
    if (call.path === "organization/members" && call.query.get("group") === "pinned") return page(call.query.has("cursor"));
    if (call.path === "sessions/lookup") return summaries(call.body!.sessionIds as string[]);
    return null;
  };
  const start = () => org.queries.members("pinned", true, org.capture(org.owners.get("one")!));
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); rest = new TestOrganization();
    rest.sessions = Array.from({ length: 100 }, (_, index) => snapshot(`recent-${index}`).session);
    chat = new ChatRuntime(new TestGateway().createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
    org.acquire(first); org.acquire(second); await settle(); rest.calls = [];
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });

  it.each(["unknown", "stale"] as const)("wiederholt nach geteiltem Fehler ausdrücklich dieselbe Seite für %s", async (initial) => {
    if (initial === "stale") {
      rest.handle = (call) => call.path === "sessions/lookup" ? summaries(call.body!.sessionIds as string[], false) : null;
      await org.queries.lookup([ids[0]!], true); rest.calls = [];
    }
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : respond(call);
    const close = org.acquire(first);
    const preparing = org.getView("one").preparePinnedReorder(); await settle();
    const joined = org.getView("other").loadMembers("pinned"); close(); await settle();
    expect(org.state.members.pinned).toMatchObject({ cursor: null, ids: [], complete: false, loading: true, revision: null });
    expect(org.state.metadata.has(ids[0]!)).toBe(true);
    release(jsonResponse({ code: "UNAVAILABLE" }, 503)); await preparing; await joined;
    expect(org.getView("other").error?.code).toBe("ORGANIZATION_FAILED");
    expect(org.state.members.pinned).toMatchObject({ cursor: null, ids: [], complete: false, loading: false });
    const count = rest.calls.length; await settle(); expect(rest.calls).toHaveLength(count);
    rest.handle = respond; org.getView("other").clearError();
    await org.getView("other").loadMembers("pinned");
    expect(memberCalls().map((call) => call.query.get("cursor"))).toEqual([null, null]);
    expect(org.state.members.pinned).toMatchObject({ cursor: "second", complete: false });
    expect(org.getView("other").rows.find((row) => row.id === ids[0])).toMatchObject({ title: "Offene Anfrage", group: "needs-input", requestCount: 1 });
    await org.getView("other").loadMembers("pinned");
    expect(org.state.members.pinned).toMatchObject({ ids, cursor: null, complete: true });
    const completeCount = rest.calls.length; await org.getView("other").loadMembers("pinned");
    expect(rest.calls).toHaveLength(completeCount); expect(lookupCalls()).toHaveLength(3);
  });

  it("behält nach Fehler auf Seite zwei die erfolgreiche erste Seite und wiederholt nur Seite zwei", async () => {
    rest.handle = respond; await start();
    rest.handle = (call) => call.path === "sessions/lookup" ? jsonResponse({ code: "UNAVAILABLE" }, 503) : respond(call);
    await org.getView("other").loadMembers("pinned");
    expect(org.state.members.pinned).toMatchObject({ ids: ids.slice(0, 100), cursor: "second", complete: false });
    expect(org.state.sessions.has(ids[0]!)).toBe(true); expect(org.state.sessions.has(ids[100]!)).toBe(false);
    rest.handle = respond; org.getView("other").clearError(); await org.getView("other").loadMembers("pinned");
    expect(memberCalls().map((call) => call.query.get("cursor"))).toEqual([null, "second", "second"]);
    expect(org.state.members.pinned).toMatchObject({ ids, complete: true });
  });

  it.each(["members", "lookup"] as const)("übernimmt bei ungültiger %s-Antwort keinen Seitenfortschritt", async (source) => {
    rest.handle = (call) => call.path === (source === "members" ? "organization/members" : "sessions/lookup")
      ? source === "members" ? jsonResponse({ invalid: true }) : summaries(["foreign"])
      : respond(call);
    await org.getView("one").preparePinnedReorder();
    expect(org.getView("one").error).not.toBeNull();
    expect(org.state.members.pinned).toMatchObject({ ids: [], cursor: null, complete: false });
    expect(org.state.sessions.has("foreign")).toBe(false);
    rest.handle = respond; await org.getView("one").loadMembers("pinned");
    expect(org.state.members.pinned).toMatchObject({ ids: ids.slice(0, 100), cursor: "second", complete: false });
  });

  it("lädt gesunde Seiten nur auf Anforderung und bestätigt Vollständigkeit nach beiden Backfills", async () => {
    rest.handle = respond; await start();
    expect(memberCalls()).toHaveLength(1); expect(lookupCalls()).toHaveLength(1);
    expect(org.state.members.pinned).toMatchObject({ ids: ids.slice(0, 100), cursor: "second", complete: false });
    await settle(); expect(memberCalls()).toHaveLength(1);
    await org.getView("other").loadMembers("pinned");
    expect(memberCalls()).toHaveLength(2); expect(lookupCalls()).toHaveLength(2);
    expect(org.state.members.pinned).toMatchObject({ ids, complete: true });
    expect(org.getView("other").error).toBeNull();
  });

  it("beginnt einen wartenden ausdrücklichen Reset erst nach dem gemeinsamen Backfill wieder bei Seite eins", async () => {
    let release!: (response: Response) => void;
    let firstLookup = true;
    rest.handle = (call) => {
      if (call.path === "sessions/lookup" && firstLookup) {
        firstLookup = false; return new Promise((resolve) => { release = resolve; });
      }
      return respond(call);
    };
    const close = org.acquire(first), pending = start(); await settle();
    const reset = org.queries.members("pinned", true, org.capture(org.owners.get("other")!));
    close(); await settle(); expect(memberCalls()).toHaveLength(1);
    release(summaries(ids.slice(0, 100))); await pending; await reset;
    expect(memberCalls().map((call) => call.query.get("cursor"))).toEqual([null, null]);
    expect(lookupCalls()).toHaveLength(2);
    expect(org.state.members.pinned).toMatchObject({ ids: ids.slice(0, 100), cursor: "second", complete: false, loading: false });
  });

  it.each([false, true])("verwirft ausstehenden Seitenfortschritt nach Flag-off mit Reenable=%s", async (reenable) => {
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : respond(call);
    const pending = start(); await settle();
    useAppPreferences.setState({ hermesV2Enabled: false });
    if (reenable) { rest.handle = null; useAppPreferences.setState({ hermesV2Enabled: true }); org.acquire(second); await settle(); }
    const membership = structuredClone(org.state.members.pinned), count = rest.calls.length;
    release(summaries(ids.slice(0, 100))); await pending; await settle();
    expect(org.state.members.pinned).toEqual(membership); expect(rest.calls).toHaveLength(count);
    expect(org.state.sessions.has(ids[0]!)).toBe(false);
  });
});
