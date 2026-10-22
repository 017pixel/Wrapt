// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, activity, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Phase-4-Clientkorrekturen", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, gateway: TestGateway, rest: TestOrganization;
  const view = () => org.getView("one");
  async function mount() {
    org.acquire({ ownerId: "one", active: true, visible: true });
    chat.acquire({ ownerId: "one", sessionId: "a", active: true, onSelectSession: vi.fn() }); await settle();
  }
  function oldMembership() {
    rest.sessions = [...Array.from({ length: 100 }, (_, index) => snapshot(`s${index}`).session), snapshot("old").session];
    rest.items.set("old", metadata("old", { pinRank: 0 }));
    let changed = false;
    rest.handle = (call) => call.path === "sessions/lookup" ? jsonResponse({ sessions: [{ ...snapshot("old").session, title: changed ? "Nachher" : "Vorher" }],
      activity: { old: activity({ state: changed ? "waiting_input" : "idle", observedAt: now + (changed ? 1 : 0) }) }, missingSessionIds: [], serverNow: now + (changed ? 1 : 0) }) : null;
    return () => { changed = true; };
  }
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); rest = new TestOrganization();
    chat = new ChatRuntime(gateway.createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  it("erneuert bekannte alte Membership-Summaries und deren echten Request beim Sidebarrefresh", async () => {
    const change = oldMembership(); await mount(); expect(view().rows.find((row) => row.id === "old")).toMatchObject({ title: "Vorher", group: "pinned" });
    change(); await view().refresh();
    expect(view().rows.find((row) => row.id === "old")).toMatchObject({ title: "Nachher", group: "needs-input", activity: "waiting_input" });
    expect(rest.calls.filter((call) => call.path === "sessions/lookup")).toHaveLength(2); expect(chat.sessionIsLeased("old")).toBe(false);
  });
  it("erneuert bei Metadata-Invalidierung auch bekannte ungeleaste Activity", async () => {
    const change = oldMembership(); await mount(); change(); rest.items.set("old", metadata("old", { pinRank: 0, revision: 1 }));
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "old", revision: 1 }, "old")); await settle();
    expect(view().rows.find((row) => row.id === "old")).toMatchObject({ title: "Nachher", group: "needs-input" });
    expect(rest.calls.filter((call) => call.path === "sessions/lookup")).toHaveLength(2);
    expect(gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(1);
  });
  it("repliziert unverändertes natives A nicht nochmals, wenn nur B hinzukommt", async () => {
    gateway.snapshots.set("a", snapshot("a", { session: { ...snapshot().session, title: "Alt" } }));
    await mount(); rest.sessions = [{ ...snapshot().session, title: "Neuer aus REST" }]; await view().refresh();
    expect(view().rows.find((row) => row.id === "a")?.title).toBe("Neuer aus REST");
    const revision = org.state.observationRevision;
    chat.upsertSummary({ ...snapshot("b").session, title: "B neu" }); await settle();
    expect(org.state.observationRevision).toBe(revision + 1);
    expect(view().rows.find((row) => row.id === "a")?.title).toBe("Neuer aus REST");
    chat.upsertSummary({ ...snapshot().session, title: "Echte neue native Änderung" }); await settle();
    expect(view().rows.find((row) => row.id === "a")?.title).toBe("Echte neue native Änderung");
  });
  it("übernimmt fremde Reorder-200-Items weder in Metadaten noch Undo und wiederholt nicht", async () => {
    rest.sessions.push(snapshot("b").session); rest.items.set("a", metadata("a", { pinRank: 0 })); await mount();
    rest.handle = (call) => call.path === "organization/reorder" ? jsonResponse({ items: [metadata("b", { revision: 5, pinRank: 0 })], undo: null, serverNow: now }) : null;
    await view().reorderPinned({ expectedPinRevision: 0, entries: [{ sessionId: "a", expectedRevision: 0 }] });
    expect(view().error).toMatchObject({ code: "PROTOCOL_MISMATCH", outcome: "unknown" });
    expect(org.state.metadata.get("b")?.pinRank).toBeNull(); expect(view().undoView).toBeNull();
    expect(rest.calls.filter((call) => call.path === "organization/reorder")).toHaveLength(1);
  });
  it("verlangt eindeutige vollständige Reorder-200-Zielmenge, erlaubt geänderte Konfliktmenge", async () => {
    const intent = { expectedPinRevision: 0, entries: [{ sessionId: "a", expectedRevision: 0 }, { sessionId: "b", expectedRevision: 0 }] };
    for (const ids of [["a"], ["a", "a"], ["a", "c"], ["a", "b", "c"]]) {
      const client = new OrganizationClient(async () => jsonResponse({ items: ids.map((id) => metadata(id)), undo: null, serverNow: now }));
      await expect(client.reorder(intent, new AbortController().signal)).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH", outcome: "unknown" });
    }
    const conflict = new OrganizationClient(async () => jsonResponse({ code: "ORGANIZATION_CONFLICT", items: [metadata("c")], pinRevision: 3, serverNow: now }, 409));
    await expect(conflict.reorder(intent, new AbortController().signal)).rejects.toMatchObject({ code: "ORGANIZATION_CONFLICT", data: { items: [{ sessionId: "c" }] } });
  });
});
