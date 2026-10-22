// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, settle } from "./chat-test-fixtures";
import { TestOrganization, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Membershipfehler innerhalb des gültigen Lifecycles", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, rest: TestOrganization;
  const options = { ownerId: "one", active: true, visible: true };
  const conflict = () => jsonResponse({ code: "ORGANIZATION_CONFLICT", items: [metadata("a", { revision: 99, pinRank: 0 })], pinRevision: 99, serverNow: now + 99 }, 409);
  async function mount() { org.acquire(options); await settle(); }
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); rest = new TestOrganization();
    chat = new ChatRuntime(new TestGateway().createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("verwirft alte 409-Nebenwirkungen nach Off/On an Microtaskgrenze %i", async (steps) => {
    await mount(); rest.handle = (call) => call.path === "organization/members" ? conflict() : null;
    const pending = org.queries.members("pinned", true).catch(() => {});
    for (let index = 0; index < steps; index++) await Promise.resolve();
    useAppPreferences.setState({ hermesV2Enabled: false }); useAppPreferences.setState({ hermesV2Enabled: true });
    rest.handle = null; rest.items.set("a", metadata("a", { revision: 1 })); await mount(); await pending; await settle();
    expect(org.state.metadata.get("a")?.revision).toBe(1); expect(org.state.pinRevision).toBe(0);
    expect(org.getView("one").error).toBeNull(); expect(org.getView("one").undoView).toBeNull();
  });
  it.each([3, 4, 5])("hält den geleerten Flag-off-State trotz altem 409 bei Grenze %i leer", async (steps) => {
    await mount(); rest.handle = (call) => call.path === "organization/members" ? conflict() : null;
    const pending = org.queries.members("pinned", true).catch(() => {});
    for (let index = 0; index < steps; index++) await Promise.resolve();
    useAppPreferences.setState({ hermesV2Enabled: false }); const calls = rest.calls.length;
    await pending; await settle();
    expect(org.state.metadata.size).toBe(0); expect(org.state.pinRevision).toBe(0); expect(rest.calls).toHaveLength(calls);
    expect(org.state.members.pinned).toMatchObject({ ids: [], complete: false, loading: false });
  });
  it("übernimmt einen aktuellen 409 weiterhin samt Stand und sichtbarem Konflikt", async () => {
    await mount(); rest.handle = (call) => call.path === "organization/members" ? conflict() : null;
    await org.getView("one").preparePinnedReorder();
    expect(org.state.metadata.get("a")?.revision).toBe(99); expect(org.getView("one").error?.code).toBe("ORGANIZATION_CONFLICT");
    expect(org.state.pinRevision).toBe(99);
    expect(org.getView("one").pinMembershipComplete).toBe(false);
  });
  it("startet einen wartenden alten Membershipreset nach Zykluswechsel nicht erneut", async () => {
    await mount(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "organization/members" ? new Promise((resolve) => { release = resolve; }) : null;
    const first = org.queries.members("pinned", true).catch(() => {});
    const queued = org.queries.members("pinned", true).catch(() => {});
    useAppPreferences.setState({ hermesV2Enabled: false }); useAppPreferences.setState({ hermesV2Enabled: true });
    rest.handle = null; await mount(); const calls = rest.calls.length;
    release(conflict()); await first; await queued; await settle();
    expect(rest.calls).toHaveLength(calls); expect(org.getView("one").error).toBeNull();
  });
});
