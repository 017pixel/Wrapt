// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HermesV2Organization } from "@wrapt/contracts/hermes-v2";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, activity, jsonResponse, metadata, now } from "./organization-test-fixtures";
import type { MemberShelf } from "./sidebar-types";

describe("Neuere Listeninvalidierung während einer Membershipprojektion", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, rest: TestOrganization, gateway: TestGateway;
  const groups = ["pinned", "snoozed", "settled"] as const;
  const organized = (group: MemberShelf, id = "old", revision = 0) => metadata(id, { revision,
    ...(group === "pinned" ? { pinRank: 0 } : group === "snoozed"
      ? { snoozedAt: now, snoozedUntil: now + 60_000, effectiveSnoozedUntil: now + 60_000 }
      : { settledAt: now, effectiveSettledAt: now }) });
  const page = (group: MemberShelf, items: HermesV2Organization[], revision = 0, more = false, pins = 0) => jsonResponse({ group, items,
    nextCursor: more ? "second" : null, hasMore: more, membershipRevision: revision, pinRevision: pins, serverNow: now });
  const lookup = (ids: string[], title = "Frisch", waiting = false) => jsonResponse({
    sessions: ids.map((id) => ({ ...snapshot(id).session, title })),
    activity: Object.fromEntries(ids.map((id) => [id, activity({ state: waiting ? "waiting_input" : "idle", openRequestCount: waiting ? 1 : 0 })])),
    missingSessionIds: [], serverNow: now,
  });
  const memberCalls = (group: MemberShelf) => rest.calls.filter((call) => call.path === "organization/members" && call.query.get("group") === group);
  const pendingPage = async (group: MemberShelf, phase: "members" | "lookup", more = false) => {
    let release!: (response: Response) => void;
    let held = false;
    rest.handle = (call) => {
      const members = call.path === "organization/members" && call.query.get("group") === group;
      if (!held && (phase === "members" ? members : call.path === "sessions/lookup")) {
        held = true; return new Promise((resolve) => { release = resolve; });
      }
      if (members) return page(group, [organized(group)], 0, more);
      if (call.path === "sessions/lookup") return lookup(call.body!.sessionIds as string[]);
      return null;
    };
    const pending = org.queries.members(group, true); await settle();
    return { pending, release: () => release(phase === "members" ? page(group, [organized(group)], 0, more) : lookup(["old"], "Alt", true)) };
  };
  const confirmEmpty = async (group: MemberShelf, pins = 0) => {
    const count = memberCalls(group).length;
    rest.handle = (call) => call.path === "organization/members" && call.query.get("group") === group ? page(group, [], 1, false, pins) : null;
    await org.getView("other").loadMembers(group);
    expect(memberCalls(group)).toHaveLength(count + 1);
    expect(memberCalls(group).at(-1)!.query.get("cursor")).toBeNull();
    expect(org.state.members[group]).toMatchObject({ ids: [], complete: true, hasMore: false, revision: 1 });
  };
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); rest = new TestOrganization();
    rest.sessions = Array.from({ length: 100 }, (_, index) => snapshot(`recent-${index}`).session);
    gateway = new TestGateway(); chat = new ChatRuntime(gateway.createClient());
    org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
    org.acquire({ ownerId: "one" }); org.acquire({ ownerId: "other" }); await settle(); rest.calls = [];
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });

  for (const phase of ["members", "lookup"] as const) {
    it.each(groups)(`erhält neuere Metadaten für %s während ${phase} und lädt ausdrücklich neu`, async (group) => {
      const { pending, release } = await pendingPage(group, phase);
      const pins = group === "pinned" ? 1 : 0;
      rest.items.set("old", metadata("old", { revision: 1, pinRevision: pins }));
      await org.queries.metadata(["old"], true);
      if (phase === "lookup") await org.queries.lookup(["old"], true);
      release(); await pending;
      expect(org.state.metadata.get("old")).toMatchObject({ revision: 1, pinRank: null, snoozedUntil: null, settledAt: null });
      expect(org.state.members[group]).toMatchObject({ complete: false, hasMore: false, cursor: null });
      expect(org.state.sessions.get("old")?.title).toBe("Frisch");
      expect(org.state.activity.get("old")?.openRequestCount).toBe(0);
      const count = rest.calls.length; await settle(); expect(rest.calls).toHaveLength(count);
      await confirmEmpty(group, pins);
    });
  }

  it.each(groups)("erstmals bekannte Organisation entwertet den alten %s-Abschluss", async (group) => {
    const { pending, release } = await pendingPage(group, "lookup");
    rest.items.set("new", organized(group, "new")); await org.queries.metadata(["new"], true);
    release(); await pending;
    expect(org.state.members[group]).toMatchObject({ complete: false, hasMore: false });
    rest.handle = (call) => call.path === "organization/members" && call.query.get("group") === group
      ? page(group, [organized(group), organized(group, "new")], 1)
      : call.path === "sessions/lookup" ? lookup(call.body!.sessionIds as string[]) : null;
    await org.getView("other").loadMembers(group);
    expect(org.state.members[group]).toMatchObject({ ids: ["old", "new"], complete: true });
    expect(memberCalls(group)).toHaveLength(2);
  });

  it.each(groups)("eine nichtterminale überholte %s-Seite startet keine automatische Folgeseite", async (group) => {
    const { pending, release } = await pendingPage(group, "lookup", true);
    rest.items.set("old", metadata("old", { revision: 1 })); await org.queries.metadata(["old"], true);
    release(); await pending;
    expect(org.state.members[group]).toMatchObject({ complete: false, hasMore: false, cursor: null });
    const count = rest.calls.length; await settle(); expect(rest.calls).toHaveLength(count);
    await confirmEmpty(group);
  });

  it.each(groups)("veraltete Rowmetadaten bestätigen auch ohne neues Ereignis keine %s-Liste", async (group) => {
    rest.items.set("old", metadata("old", { revision: 2 })); await org.queries.metadata(["old"], true);
    const { pending, release } = await pendingPage(group, "lookup"); release(); await pending;
    expect(org.state.metadata.get("old")?.revision).toBe(2);
    expect(org.state.members[group].complete).toBe(false);
    await confirmEmpty(group);
  });

  it.each(groups)("eigene frische %s-Seitenmetadaten und identische externe Rows entwerten den Abschluss nicht", async (group) => {
    const { pending, release } = await pendingPage(group, "lookup");
    rest.items.set("old", organized(group)); await org.queries.metadata(["old"], true);
    // Unorganisierte Baseline einer neuen Row belegt keine Listenänderung.
    await org.queries.metadata(["unorganized"], true);
    release(); await pending;
    expect(org.state.members[group]).toMatchObject({ ids: ["old"], complete: true, hasMore: false });
    const count = rest.calls.length; await org.getView("other").loadMembers(group); expect(rest.calls).toHaveLength(count);
  });

  it.each(groups)("ignoriert ältere externe Rowmetadaten während aktuellem %s-Seitenabschluss", async (group) => {
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "organization/members" && call.query.get("group") === group
      ? page(group, [organized(group, "old", 2)], 2)
      : call.path === "sessions/lookup" ? new Promise((resolve) => { release = resolve; }) : null;
    const pending = org.queries.members(group, true); await settle();
    rest.items.set("old", organized(group, "old", 1)); await org.queries.metadata(["old"], true);
    release(lookup(["old"])); await pending;
    expect(org.state.metadata.get("old")?.revision).toBe(2);
    expect(org.state.members[group]).toMatchObject({ ids: ["old"], complete: true, revision: 2 });
  });

  it.each(groups)("eigene leere %s-Seite darf eine neue Pinrevision selbst bestätigen", async (group) => {
    rest.handle = (call) => call.path === "organization/members" && call.query.get("group") === group ? page(group, [], 1, false, 1) : null;
    await org.queries.members(group, true);
    expect(org.state.pinRevision).toBe(1);
    expect(org.state.members[group]).toMatchObject({ ids: [], complete: true, pinRevision: 1, revision: 1 });
    const count = rest.calls.length; await org.getView("other").loadMembers(group); expect(rest.calls).toHaveLength(count);
  });

  it("ein Ereignis entwertet schon vor erfolgreichem Metadatenabruf den wartenden Abschluss", async () => {
    chat.acquire({ ownerId: "one", sessionId: "recent-0", onSelectSession: vi.fn(), active: true }); await settle();
    const { pending, release } = await pendingPage("pinned", "lookup");
    let releaseMetadata!: (response: Response) => void;
    const previous = rest.handle;
    rest.handle = (call) => call.path === "organization" && call.query.getAll("sessionId").includes("old")
      ? new Promise((resolve) => { releaseMetadata = resolve; }) : previous!(call);
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "old", revision: 1 }, "old")); await settle();
    release(); await pending;
    expect(org.state.members.pinned).toMatchObject({ complete: false, hasMore: false });
    releaseMetadata(jsonResponse({ code: "UNAVAILABLE" }, 503)); await settle();
    expect(org.getView("other").error?.code).toBe("ORGANIZATION_FAILED");
    await confirmEmpty("pinned", 1);
  });

  it("eine höhere Pinrevision aus leerem 409 entwertet auch eine wartende Snoozeseite", async () => {
    const { pending, release } = await pendingPage("snoozed", "lookup");
    rest.handle = (call) => call.path === "organization/members" && call.query.get("group") === "pinned"
      ? jsonResponse({ code: "ORGANIZATION_CONFLICT", items: [], pinRevision: 1, serverNow: now }, 409) : null;
    await org.getView("other").preparePinnedReorder();
    expect(org.state.pinRevision).toBe(1);
    release(); await pending;
    expect(org.state.members.snoozed.complete).toBe(false);
    await confirmEmpty("snoozed", 1);
  });
});
