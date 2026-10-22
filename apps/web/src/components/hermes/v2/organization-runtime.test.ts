// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, event, row, settle, snapshot } from "./chat-test-fixtures";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestOrganization, activity, jsonResponse, metadata, now, undoHandle } from "./organization-test-fixtures";

describe("Gemeinsame Organisationsruntime", () => {
  const running: { chat: ChatRuntime; org: OrganizationRuntime }[] = [];
  function setup() {
    const gateway = new TestGateway(), rest = new TestOrganization(), chat = new ChatRuntime(gateway.createClient());
    const org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch)); running.push({ chat, org });
    return { gateway, rest, chat, org };
  }
  function mount(org: OrganizationRuntime, chat: ChatRuntime, ownerId = "one", sessionId = "a") {
    const release = org.acquire({ ownerId, sessionId, active: true, visible: true });
    const close = chat.acquire({ ownerId, sessionId, active: true, visible: true, onSelectSession: vi.fn() });
    return () => { release(); close(); };
  }
  beforeEach(() => { vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); });
  afterEach(() => {
    for (const { chat, org } of running.splice(0)) { org.dispose(); chat.dispose("v2-disabled"); }
    useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers();
  });
  it("hat bei Konstruktion/Flag-off keinen Lifecycle und leiht keinen Chatowner", async () => {
    useAppPreferences.setState({ hermesV2Enabled: false }); const { gateway, rest, org, chat } = setup();
    org.acquire({ ownerId: "one" }); await settle();
    expect(rest.calls).toHaveLength(0); expect(gateway.sockets).toHaveLength(0); expect(chat.owners.records.size).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it("zählt ein laufendes Werkzeug als Arbeit, auch wenn der Server idle meldet", async () => {
    // Der Server kann zwischen zwei Werkzeugen kurz "idle" melden. Das
    // gestartete Werkzeug beweist aber, dass der Agent arbeitet.
    const { org, chat, rest, gateway } = setup();
    rest.sessions = [{ ...snapshot("a").session, running: false }];
    gateway.snapshots.set(
      "a",
      snapshot("a", {
        messages: [
          row(1, "", {
            role: "tool",
            toolId: "t1",
            toolName: "browser",
            toolStatus: "running",
          }),
        ],
      }),
    );
    mount(org, chat, "one", "a");
    await settle();
    const zeile = org.getView("one").rows.find((eintrag) => eintrag.id === "a");
    expect(zeile?.group).toBe("working");
    expect(zeile?.activity).toBe("working");
  });

  it("teilt 20 aktive Flächen und StrictMode-Replay ohne zweiten Socket oder Sessions-RPC", async () => {
    const { org, chat, gateway } = setup();
    const release = mount(org, chat); release(); mount(org, chat);
    for (let index = 1; index < 20; index++) mount(org, chat, `o${index}`, `s${index}`);
    await settle();
    expect(gateway.sockets).toHaveLength(1); expect(new URL(gateway.socket.url).searchParams.get("readEvidence")).toBe("1");
    expect(gateway.sent.filter((frame) => frame.op === "sessions.list")).toHaveLength(0);
    expect(gateway.sent.filter((frame) => frame.op === "session.subscribe")).toHaveLength(20);
    expect(chat.owners.records.size).toBe(20); expect(org.owners.size).toBe(20);
    chat.actionsFor("one").setDraft("bleibt beim Chat"); expect(chat.owners.getView("one").draft).toBe("bleibt beim Chat");
  });
  it("lädt ehrliche Katalogseiten auch nach null Suchtreffern und verwirft alte Suche", async () => {
    const { org, chat, rest } = setup(); rest.sessions = Array.from({ length: 201 }, (_, index) => snapshot(`s${index}`).session);
    mount(org, chat); await settle();
    const api = org.getView("one"); api.setQuery("s200"); await settle();
    expect(org.getView("one").search).toMatchObject({ loadedCount: 0, partial: true, nextOffset: 100, hasMore: true });
    await org.getView("one").loadMore(); expect(org.getView("one").search.nextOffset).toBe(200);
    await org.getView("one").loadMore(); expect(org.getView("one").search).toMatchObject({ loadedCount: 1, partial: false, hasMore: false });
    expect(org.getView("one").rows.map((row) => row.id)).toEqual(["s200"]);
    let resolve!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions" && call.query.get("q") === "old" ? new Promise((done) => { resolve = done; }) : null;
    api.setQuery("old"); api.setQuery("s199"); await settle();
    resolve(jsonResponse({ sessions: [snapshot("wrong").session], activity: {}, offset: 0, limit: 100, nextOffset: null, hasMore: false, coverage: "complete", serverNow: now }));
    await settle(); expect(org.getView("one").search.query).toBe("s199"); expect(org.getView("one").rows.some((row) => row.id === "wrong")).toBe(false);
  });
  it("liefert alte Mitgliedschaften außerhalb des Katalogs mit ehrlichem ID-Ersatz", async () => {
    const { org, chat, rest } = setup(); rest.items.set("old", metadata("old", { pinRank: 0 }));
    mount(org, chat); await settle();
    expect(org.getView("one").rows.find((row) => row.id === "old")).toMatchObject({ title: "old", pinned: true, missingSummary: true });
    expect(rest.calls.some((call) => call.path === "sessions/lookup" && (call.body?.sessionIds as string[]).includes("old"))).toBe(true);
    expect(org.getView("one").pinMembershipComplete).toBe(true);
  });
  it("verarbeitet Metadata-Invalidierung vor Leasefilter, auch wenn der Snooze nur in Summaries ist", async () => {
    const { org, chat, gateway, rest } = setup(); rest.items.set("old", metadata("old", { snoozedUntil: now + 10000, effectiveSnoozedUntil: now + 10000 }));
    mount(org, chat); await settle(); await org.getView("one").loadMembers("snoozed");
    expect(chat.sessionIsLeased("old")).toBe(false);
    rest.items.set("old", metadata("old", { revision: 1, snoozedUntil: now + 10000, effectiveSnoozedUntil: null }));
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "old", revision: 1 }, "old")); await settle();
    expect(org.getView("one").rows.find((row) => row.id === "old")?.group).toBe("active");
  });
  it("publiziert Create/Rename ohne sessions.changed und ignoriert sämtliche Tokenevents", async () => {
    const { org, chat, gateway } = setup(); mount(org, chat); await settle();
    const notify = vi.fn(); org.subscribe("one", notify);
    gateway.socket.event(event("message.delta", 1, { turnId: "t", text: "a" }));
    gateway.socket.event(event("reasoning.delta", 2, { turnId: "t", text: "b" }));
    expect(notify).not.toHaveBeenCalled();
    chat.upsertSummary({ ...snapshot("new").session, title: "Neu" }); await settle();
    expect(org.getView("one").rows.some((row) => row.id === "new" && row.title === "Neu")).toBe(true);
    chat.upsertSummary({ ...snapshot("new").session, title: "Umbenannt" }); await settle();
    expect(org.getView("one").rows.find((row) => row.id === "new")?.title).toBe("Umbenannt");
  });
  it("übernimmt CAS-Konflikte, wiederholt nicht und hält Undo nur für zehn Serversekunden", async () => {
    const { org, chat, rest } = setup(); mount(org, chat); await settle();
    rest.handle = (call) => call.path === "organization/action" ? jsonResponse({ code: "ORGANIZATION_CONFLICT", items: [metadata("a", { revision: 5 })], pinRevision: 2, serverNow: now }, 409) : null;
    await org.getView("one").organize({ sessionId: "a", expectedRevision: 0, action: "pin" });
    expect(org.getView("one").error?.code).toBe("ORGANIZATION_CONFLICT"); expect(org.state.metadata.get("a")?.revision).toBe(5);
    expect(rest.calls.filter((call) => call.path === "organization/action")).toHaveLength(1);
    rest.handle = null; await org.getView("one").organize({ sessionId: "a", expectedRevision: 5, action: "pin" });
    expect(org.getView("one").undoView?.handle).toBe(undoHandle);
    await vi.advanceTimersByTimeAsync(10_000); expect(org.getView("one").undoView).toBeNull();
    await org.getView("one").undo(); expect(rest.calls.filter((call) => call.path === "organization/undo")).toHaveLength(0);
  });
  it("stoppt HTTP, Listener und einzigen Timer bei Flag-off unmittelbar", async () => {
    const { org, chat, rest, gateway } = setup(); mount(org, chat); await settle();
    await org.getView("one").organize({ sessionId: "a", expectedRevision: 0, action: "snooze", snoozedUntil: now + 1000 });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    rest.handle = (call) => call.path === "sessions" ? new Promise<Response>(() => {}) : null;
    org.getView("one").setQuery("pending");
    useAppPreferences.setState({ hermesV2Enabled: false }); const calls = rest.calls.length, frames = gateway.sent.length;
    expect(rest.calls.at(-1)?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000); expect(rest.calls).toHaveLength(calls); expect(gateway.sent).toHaveLength(frames);
    expect(vi.getTimerCount()).toBe(0); expect(org.owners.size).toBe(0); expect(gateway.socket.closeReason).toBe("v2-disabled");
  });
  it("hält eine lokal laufende Sitzung in „In Arbeit“, auch wenn der Server „idle“ meldet", async () => {
    const { org, chat } = setup(); mount(org, chat); await settle();
    const row = () => org.getView("one").rows.find((entry) => entry.id === "a");
    expect(row()?.group).toBe("active");
    // Der Client kennt die Sitzung als laufend, der Server meldet weiterhin nichts.
    chat.store.update("a", (state) => ({ ...state, running: true })); await settle();
    expect(row()).toMatchObject({ group: "working", activity: "working" });
    // Endet der Turn, fällt die Zeile zurück in die Hauptliste.
    chat.store.update("a", (state) => ({ ...state, running: false })); await settle();
    expect(row()?.group).toBe("active");
  });
  it("stellt Snooze in der letzten Sekunde rein lokal um und bewahrt unbekannte Activity", async () => {
    const { org, chat, rest } = setup(); rest.items.set("a", metadata("a", { effectiveSnoozedUntil: now + 1 }));
    mount(org, chat); await settle(); const before = rest.calls.length;
    await vi.advanceTimersByTimeAsync(2); expect(org.getView("one").rows.find((row) => row.id === "a")?.group).toBe("active");
    expect(rest.calls).toHaveLength(before);
    org.state.mergeSessions([], { a: activity() }); org.emitAll(); expect(org.getView("one").rows[0]?.activity).toBe("unknown");
  });
});
