// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, activity, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Geteilter Membershipbackfill im ursprünglichen Runtime", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, rest: TestOrganization;
  const first = { ownerId: "one", active: true, visible: true };
  const second = { ownerId: "other", active: true, visible: true };
  const lookups = () => rest.calls.filter((call) => call.path === "sessions/lookup");
  const lookup = (title: string, waiting = true) => jsonResponse({ sessions: [{ ...snapshot("old-pin").session, title }],
    activity: { "old-pin": activity({ state: waiting ? "waiting_input" : "idle", openRequestCount: waiting ? 1 : 0 }) }, missingSessionIds: [], serverNow: now });
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); rest = new TestOrganization();
    rest.sessions = [...Array.from({ length: 100 }, (_, index) => snapshot(`recent-${index}`).session), snapshot("old-pin").session];
    rest.items.set("old-pin", metadata("old-pin", { pinRank: 0 }));
    chat = new ChatRuntime(new TestGateway().createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  it.each(["release", "generation", "query"] as const)("behält unbekannten wartenden Chat für zweiten Owner nach %s des Erstanfragers", async (change) => {
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    const close = org.acquire(first); await settle(); org.acquire(second); await settle();
    expect(org.state.members.pinned).toMatchObject({ complete: false, loading: true });
    expect(org.state.sessions.has("old-pin")).toBe(false);
    if (change === "release") close(); else if (change === "generation") org.update({ ...first, visible: false }); else org.getView("one").setQuery("neue Suche");
    await settle(); release(lookup("Bestätigter wartender Chat")); await settle();
    await org.getView("other").loadMembers("pinned");
    expect(org.getView("other").rows.find((row) => row.id === "old-pin")).toMatchObject({ title: "Bestätigter wartender Chat", missingSummary: false, group: "needs-input", requestCount: 1 });
    expect(lookups()).toHaveLength(1); expect(org.state.members.pinned.loading).toBe(false);
  });
  it.each(["release", "generation"] as const)("erneuert bekannte alte Activity trotz %s während geteiltem Refresh", async (change) => {
    rest.handle = (call) => call.path === "sessions/lookup" ? lookup("Veraltet", false) : null;
    const close = org.acquire(first); org.acquire(second); await settle();
    expect(org.getView("other").rows.find((row) => row.id === "old-pin")?.group).toBe("pinned");
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    const refreshing = org.getView("one").refresh(); await settle();
    const joined = org.getView("other").loadMembers("pinned");
    if (change === "release") close(); else org.update({ ...first, visible: false });
    release(lookup("Frisch")); await refreshing; await joined;
    expect(org.getView("other").rows.find((row) => row.id === "old-pin")).toMatchObject({ title: "Frisch", requestCount: 1, group: "needs-input" });
    expect(lookups()).toHaveLength(2); expect(org.getView("other").error).toBeNull();
  });
  it("zeigt echten Backfillfehler ohne automatischen Retry und lässt ausdrückliches Gruppenladen reparieren", async () => {
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    const close = org.acquire(first); await settle(); org.acquire(second); await settle(); close();
    release(jsonResponse({ code: "UNAVAILABLE" }, 503)); await settle();
    expect(lookups()).toHaveLength(1); expect(org.state.members.pinned.complete).toBe(false);
    expect(org.getView("other").error?.code).toBe("ORGANIZATION_FAILED");
    rest.handle = (call) => call.path === "sessions/lookup" ? lookup("Erneut bestätigt") : null;
    await org.getView("other").loadMembers("pinned");
    expect(lookups()).toHaveLength(2); expect(org.getView("other").rows.find((row) => row.id === "old-pin")).toMatchObject({ title: "Erneut bestätigt", group: "needs-input", requestCount: 1 });
  });
  it("übernimmt den globalen alten Backfill nach Off/On nicht in den neuen Runtime", async () => {
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    org.acquire(first); await settle(); org.acquire(second); await settle();
    useAppPreferences.setState({ hermesV2Enabled: false }); useAppPreferences.setState({ hermesV2Enabled: true });
    rest.handle = (call) => call.path === "sessions/lookup" ? lookup("Neuer Zyklus", false) : null;
    org.acquire(second); await settle(); const count = rest.calls.length;
    release(lookup("Alter wartender Zyklus")); await settle(); await settle();
    expect(rest.calls).toHaveLength(count); expect(org.getView("other").rows.find((row) => row.id === "old-pin")).toMatchObject({ title: "Neuer Zyklus", group: "pinned", requestCount: 0 });
  });
  it("verwirft weiterhin ausdrücklich ownergebundenen Lookup nach Generationswechsel", async () => {
    org.acquire(first); org.acquire(second); await settle(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    const valid = org.capture(org.owners.get("one")!);
    const pending = org.queries.lookup(["owner-only"], true, valid); org.update({ ...first, visible: false });
    release(jsonResponse({ sessions: [snapshot("owner-only").session], activity: {}, missingSessionIds: [], serverNow: now })); await pending;
    expect(org.state.sessions.has("owner-only")).toBe(false);
    const count = rest.calls.length; await org.queries.members("pinned", true, valid); expect(rest.calls).toHaveLength(count);
  });
});
