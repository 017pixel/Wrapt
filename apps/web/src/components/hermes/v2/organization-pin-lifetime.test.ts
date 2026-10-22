// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, settle } from "./chat-test-fixtures";
import { TestOrganization, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Endliche ownergebundene Pinvorbereitung", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, rest: TestOrganization;
  const options = { ownerId: "one", active: true, visible: true };
  const page = (more = false) => jsonResponse({ group: "pinned", items: [metadata("a", { pinRank: 0 })], nextCursor: more ? "next" : null,
    hasMore: more, pinRevision: 0, membershipRevision: 0, serverNow: now });
  beforeEach(async () => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); rest = new TestOrganization();
    chat = new ChatRuntime(new TestGateway().createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
    org.acquire({ ownerId: "other" }); org.acquire(options); await settle();
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("beendet Flag-off vor jeder deaktivierten No-op-Iteration", async () => {
    let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "organization/members" ? new Promise((resolve) => { release = resolve; }) : null;
    const original = org.queries.members.bind(org.queries); let disabled = 0;
    vi.spyOn(org.queries, "members").mockImplementation((...args) => {
      if (!org.enabled() && ++disabled > 16) throw Error("Testwächter für Endlosschleife");
      return original(...args);
    });
    const pending = org.getView("one").preparePinnedReorder();
    useAppPreferences.setState({ hermesV2Enabled: false }); const calls = rest.calls.length;
    release(page(true)); await pending; expect(disabled).toBe(0); expect(rest.calls).toHaveLength(calls);
  });
  it.each(["release", "generation"] as const)("beendet alte Vorbereitung bei %s trotz weiter aktivem anderem Owner", async (change) => {
    const releaseOwner = org.acquire(options); await settle(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "organization/members" ? new Promise((resolve) => { release = resolve; }) : null;
    const pending = org.getView("one").preparePinnedReorder(); await settle();
    if (change === "release") { releaseOwner(); await settle(); } else org.update({ ...options, visible: false });
    const calls = rest.calls.length; release(page(true)); await pending;
    const following = rest.calls.slice(calls);
    expect(following.filter((call) => call.path === "organization/members")).toHaveLength(0);
    expect(following.filter((call) => call.path === "sessions/lookup")).toHaveLength(1);
    expect(org.enabled()).toBe(true); expect(org.state.members.pinned.loading).toBe(false);
  });
  it("beendet ausbleibenden Mengenfortschritt trotz wechselnder Cursor mit sichtbarem Fehler", async () => {
    let count = 0;
    rest.handle = (call) => call.path === "organization/members" ? jsonResponse({ group: "pinned", items: [metadata("a", { pinRank: 0 })],
      nextCursor: `cursor-${++count}`, hasMore: true, pinRevision: 0, membershipRevision: 0, serverNow: now }) : null;
    await org.getView("one").preparePinnedReorder();
    expect(count).toBe(2); expect(org.getView("one").error?.code).toBe("PROTOCOL_MISMATCH");
    expect(rest.calls.some((call) => call.path === "organization/reorder")).toBe(false);
  });
  it("lädt aktuelle vollständige Pinmenge mit echtem Fortschritt und hält HTTP-Fehler sichtbar", async () => {
    const pins = Array.from({ length: 101 }, (_, index) => metadata(`p${index}`, { pinRank: index }));
    rest.handle = (call) => call.path === "organization/members" ? jsonResponse({ group: "pinned", items: call.query.has("cursor") ? pins.slice(100) : pins.slice(0, 100),
      nextCursor: call.query.has("cursor") ? null : "next", hasMore: !call.query.has("cursor"), pinRevision: 0, membershipRevision: 0, serverNow: now }) : null;
    await org.getView("one").preparePinnedReorder(); expect(org.getView("one").pinMembershipComplete).toBe(true); expect(org.pins()).toHaveLength(101);
    rest.handle = (call) => call.path === "organization/members" ? jsonResponse({ code: "UNAVAILABLE" }, 503) : null;
    await org.getView("one").preparePinnedReorder(); expect(org.getView("one").error?.code).toBe("ORGANIZATION_FAILED");
  });
  it("lässt einen gültigen zweiten Owner einen wegen geschlossenem Erstowner ungefüllten Sharedread übernehmen", async () => {
    let release!: (response: Response) => void, count = 0;
    rest.handle = (call) => call.path === "organization/members" && ++count === 1 ? new Promise((resolve) => { release = resolve; })
      : call.path === "organization/members" ? page() : null;
    const releaseOwner = org.acquire(options); await settle();
    const preparing = org.getView("one").preparePinnedReorder(); await settle();
    const other = org.getView("other").loadMembers("pinned"); releaseOwner(); await settle();
    release(page()); await preparing; await other;
    expect(org.state.members.pinned.loading).toBe(false); expect(org.state.members.pinned.complete).toBe(true);
    expect(org.getView("other").error).toBeNull();
  });
});
