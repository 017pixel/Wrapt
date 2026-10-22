// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, jsonResponse, metadata, now } from "./organization-test-fixtures";
import { validPinReorder } from "./sidebar-dnd";
import { resolveSidebarRow } from "./sidebar-resolver";
import { activity } from "./organization-test-fixtures";

describe("Organisations-Races und Mitgliedschaft", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, gateway: TestGateway, rest: TestOrganization;
  async function mount() {
    org.acquire({ ownerId: "one", active: true, visible: true });
    chat.acquire({ ownerId: "one", sessionId: "a", active: true, onSelectSession: vi.fn() }); await settle();
  }
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); rest = new TestOrganization();
    chat = new ChatRuntime(gateway.createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  it("lädt volle Pinmitgliedschaft über mehrere Seiten auch bei aktiver Suchfilterung", async () => {
    const pins = Array.from({ length: 101 }, (_, index) => metadata(`p${index}`, { pinRank: index, revision: index }));
    rest.handle = (call) => call.path === "organization/members" && call.query.get("group") === "pinned"
      ? jsonResponse({ group: "pinned", items: call.query.get("cursor") ? pins.slice(100) : pins.slice(0, 100),
        nextCursor: call.query.get("cursor") ? null : "next", hasMore: !call.query.get("cursor"), membershipRevision: 5, pinRevision: 0, serverNow: now }) : null;
    await mount(); expect(org.getView("one").pinMembershipComplete).toBe(false);
    org.getView("one").setQuery("p100"); await settle(); await org.getView("one").preparePinnedReorder();
    expect(org.getView("one").rows.filter((row) => row.pinned)).toHaveLength(1);
    const plan = org.getView("one").planDrop("p100", "pinned", "p0");
    expect(plan.allowed && plan.kind === "reorder" && plan.command.entries.length).toBe(101);
    if (!plan.allowed || plan.kind !== "reorder") throw Error("plan");
    expect(plan.command.entries[0]?.sessionId).toBe("p100"); expect(validPinReorder(plan.command, org.pins(), true, org.state.pinRevision)).toBe(true);
  });
  it("verwirft Mitgliedschaft bei zwischenzeitlichem Listenwechsel ohne Reorder aus Teilmenge", async () => {
    let revision = 1;
    rest.handle = (call) => call.path === "organization/members" && call.query.get("group") === "pinned"
      ? jsonResponse({ group: "pinned", items: [metadata(call.query.get("cursor") ? "p2" : "p1", { pinRank: 0 })],
        nextCursor: "next", hasMore: true, membershipRevision: revision++, pinRevision: 0, serverNow: now }) : null;
    await mount(); await org.getView("one").loadMembers("pinned");
    expect(org.getView("one").error?.code).toBe("ORGANIZATION_CONFLICT"); expect(org.getView("one").pinMembershipComplete).toBe(false);
    await org.getView("one").reorderPinned({ expectedPinRevision: 0, entries: [{ sessionId: "p1", expectedRevision: 0 }] });
    expect(rest.calls.filter((call) => call.path === "organization/reorder")).toHaveLength(0);
  });
  it("lässt eine Invalidierung während laufender Metadata-Lesung nicht mit deren altem Stand verschwinden", async () => {
    await mount(); let release!: (response: Response) => void, held = false;
    rest.handle = (call) => {
      if (call.path === "organization" && !held) { held = true; return new Promise((resolve) => { release = resolve; }); }
      return null;
    };
    const reading = org.queries.metadata(["a"]); rest.items.set("a", metadata("a", { revision: 2 }));
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "a", revision: 2 }));
    release(jsonResponse([metadata("a", { revision: 1 })])); await reading; await settle();
    expect(org.state.metadata.get("a")?.revision).toBe(2);
  });
  it("macht neu invalidierte bisher ungeladene Sitzungen sichtbar und liest sie niemals automatisch", async () => {
    await mount(); rest.sessions.push(snapshot("outside").session);
    rest.items.set("outside", metadata("outside", { revision: 1, attention: { unreadCount: 1, requiresAttention: true, latest: null } }));
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "outside", revision: 1 }, "outside")); await settle();
    expect(org.getView("one").rows.find((row) => row.id === "outside")?.group).toBe("needs-input");
    expect(rest.calls.filter((call) => call.path === "organization/read")).toHaveLength(0);
  });
  it("kann nach Flag-off mit noch verspäteter alter HTTP-Antwort sofort frisch laden", async () => {
    await mount(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "organization" ? new Promise((resolve) => { release = resolve; }) : null;
    const old = org.queries.metadata(["a"]).catch(() => {});
    useAppPreferences.setState({ hermesV2Enabled: false }); useAppPreferences.setState({ hermesV2Enabled: true });
    rest.handle = null; rest.items.set("a", metadata("a", { revision: 3 })); await mount();
    expect(org.state.metadata.get("a")?.revision).toBe(3);
    release(jsonResponse([metadata("a", { revision: 1 })])); await old; await settle();
    expect(org.state.metadata.get("a")?.revision).toBe(3);
  });
  it("begründet Working nur durch belegte aktive Sub-/Backgroundcounts und erfindet keinen Turnstart", () => {
    for (const counts of [{ subagentCount: 1 }, { backgroundCount: 1 }]) {
      const row = resolveSidebarRow(null, metadata(), activity({ state: "idle", turnStartedAt: now - 10000, ...counts }), now);
      expect(row).toMatchObject({ group: "working", turnStartedAt: null, durationMs: null });
    }
  });
  it("behält deterministische eindeutige Reihenfolgen für beliebige Pinpermutationen", () => {
    const pins = Array.from({ length: 30 }, (_, index) => resolveSidebarRow(null, metadata(`p${index}`, { pinRank: index, revision: index }), null, now));
    for (let shift = 0; shift < 30; shift++) {
      const permuted = [...pins.slice(shift), ...pins.slice(0, shift)];
      expect(validPinReorder({ expectedPinRevision: 5, entries: permuted.map((row) => ({ sessionId: row.id, expectedRevision: row.metadata.revision })) }, pins, true, 5)).toBe(true);
      const missing = permuted.slice(1);
      expect(validPinReorder({ expectedPinRevision: 5, entries: missing.map((row) => ({ sessionId: row.id, expectedRevision: row.metadata.revision })) }, pins, true, 5)).toBe(false);
    }
  });
  it("überschreibt eine neuere native Umbenennung nicht mit einer später eintreffenden alten Katalogseite", async () => {
    await mount(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions" ? new Promise((resolve) => { release = resolve; }) : null;
    const refresh = org.getView("one").loadMore();
    // Expliziter Reset beginnt auch nach vollständig geladener erster Seite.
    org.getView("one").setQuery("");
    chat.upsertSummary({ ...snapshot().session, title: "Autoritativ neu" });
    release(jsonResponse({ sessions: [{ ...snapshot().session, title: "Alt" }], activity: {}, offset: 0, limit: 100, hasMore: false, nextOffset: null, coverage: "complete", serverNow: now }));
    await refresh; await settle(); expect(org.getView("one").rows.find((row) => row.id === "a")?.title).toBe("Autoritativ neu");
  });
});
