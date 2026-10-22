// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { TestGateway, completed, event, inflight, row, settle, snapshot } from "./chat-test-fixtures";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestOrganization, evidenceA, evidenceB, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Exakte sichtbar angewandte Lesebelege", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, gateway: TestGateway, rest: TestOrganization;
  const reads = () => rest.calls.filter((call) => call.path === "organization/read");
  const read = () => org.getView("one").readView;
  const options = (sessionId = "a", active = true, visible = true) => ({ ownerId: "one", sessionId, active, visible, onSelectSession: vi.fn() });
  async function mount(messages = [row(1, "Antwort", { readEvidence: evidenceA })]) {
    gateway.snapshots.set("a", snapshot("a", { messages }));
    org.acquire(options()); chat.acquire(options()); await settle();
  }
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true });
    gateway = new TestGateway(); rest = new TestOrganization(); chat = new ChatRuntime(gateway.createClient());
    org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("liest weder bei Snapshotempfang noch Katalog/Baseline, sondern erst nach sichtbarer Row", async () => {
    await mount(); expect(read().generation).not.toBeNull(); expect(reads()).toHaveLength(0);
    await read().onVisibleEvidence(read().generation!, [evidenceA]); expect(reads()).toHaveLength(1);
    expect(reads()[0]?.body).toEqual({ sessionId: "a", evidence: [evidenceA] });
    await read().onVisibleEvidence(read().generation!, [evidenceA]); expect(reads()).toHaveLength(1);
  });
  it("ACKt A exakt, obwohl früherer ungerenderter oder später ingestierter Fakt B offen bleibt", async () => {
    await mount([row(1, "ungesehen", { readEvidence: evidenceB }), row(2, "sichtbar", { readEvidence: evidenceA })]);
    await read().onVisibleEvidence(read().generation!, [evidenceA]);
    expect(reads()[0]?.body?.evidence).toEqual([evidenceA]);
    rest.items.set("a", metadata("a", { revision: 4, attention: { unreadCount: 1, requiresAttention: true, latest: null } }));
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "a", revision: 4 })); await settle();
    expect(org.getView("one").rows.find((entry) => entry.id === "a")?.unreadCount).toBe(1);
    expect(reads()).toHaveLength(1);
  });
  it("verwirft A→B→ReadA und unmittelbar vor Batchflush gewechselte Auswahl", async () => {
    await mount(); const previous = read(); const pending = previous.onVisibleEvidence(previous.generation!, [evidenceA]);
    chat.actionsFor("one").selectSession("b"); await pending; await settle();
    await previous.onVisibleEvidence(previous.generation!, [evidenceA]); expect(reads()).toHaveLength(0);
    expect(read().sessionId).toBe("b");
  });
  it("verwirft alte Snapshotgeneration auch bei kleinerem Same-Epoch-Cursor", async () => {
    await mount(); const old = read();
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { cursor: 0, messages: [row(1, "Antwort", { readEvidence: evidenceA })] }) });
    await settle(); expect(read().generation).not.toBe(old.generation);
    await old.onVisibleEvidence(old.generation!, [evidenceA]); expect(reads()).toHaveLength(0);
    await read().onVisibleEvidence(read().generation!, [evidenceA]); expect(reads()).toHaveLength(1);
  });
  it("verweigert versteckte/geparkte/inkonsistente Owner und fälschlich konstruierte Generation", async () => {
    await mount(); const old = read();
    org.update({ ownerId: "one", sessionId: "a", active: false, visible: true });
    await old.onVisibleEvidence(old.generation!, [evidenceA]); expect(reads()).toHaveLength(0);
    org.update({ ownerId: "one", sessionId: "b", active: true, visible: true }); expect(read().generation).toBeNull();
    org.update({ ownerId: "one", sessionId: "a", active: true, visible: true });
    chat.update(options("a", true, false)); expect(read().generation).toBeNull();
    chat.update(options());
    await read().onVisibleEvidence({} as NonNullable<ReturnType<typeof read>["generation"]>, [evidenceA]); expect(reads()).toHaveLength(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange"));
    expect(read().generation).toBeNull();
  });
  it("verwirft gemischte ungültige Batches atomar und bestätigt keine Inflight/Interimprojektion", async () => {
    await mount(); await read().onVisibleEvidence(read().generation!, [evidenceA, evidenceB]); expect(reads()).toHaveLength(0);
    gateway.socket.receive({ v: 1, type: "snapshot", snapshot: snapshot("a", { inflight, running: true }) }); await settle();
    await read().onVisibleEvidence(read().generation!, [evidenceB]); expect(reads()).toHaveLength(0);
    gateway.socket.event(event("message.interim", 1, { turnId: "t", text: "Zwischenstand", alreadyStreamed: false }));
    expect(chat.store.get("a").messages.at(-1)?.status).toBe("interim"); expect(reads()).toHaveLength(0);
  });
  it("bewahrt Requestattention nach Read und stellt alten Snooze/Settle niemals lokal wieder her", async () => {
    rest.items.set("a", metadata("a", { revision: 1, snoozedUntil: now + 10000, effectiveSnoozedUntil: null, settledAt: now, effectiveSettledAt: null,
      attention: { unreadCount: 2, requiresAttention: true, latest: null } }));
    await mount(); await read().onVisibleEvidence(read().generation!, [evidenceA]);
    expect(org.getView("one").rows[0]).toMatchObject({ group: "needs-input", unreadCount: 2, snoozedUntil: null, settledAt: null });
    rest.items.set("a", metadata("a", { revision: 2, snoozedUntil: now + 20000, effectiveSnoozedUntil: now + 20000 }));
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "a", revision: 2 })); await settle();
    expect(org.getView("one").rows[0]?.group).toBe("snoozed");
  });
  it("erneuert abgelaufene Rowbelege, ACKt die neue Projektion erst nach erneutem Sichtbarcallback", async () => {
    await mount(); let attempt = 0;
    gateway.pages.set("a:0", [row(1, "Antwort", { readEvidence: evidenceB })]);
    rest.handle = (call) => call.path === "organization/read" && attempt++ === 0 ? jsonResponse({ code: "READ_EVIDENCE_EXPIRED" }, 400) : null;
    await read().onVisibleEvidence(read().generation!, [evidenceA]); await settle();
    expect(reads()).toHaveLength(1); expect(chat.store.get("a").messages[0]?.readEvidence).toBe(evidenceB);
    await read().onVisibleEvidence(read().generation!, [evidenceA]); expect(reads()).toHaveLength(1);
    await read().onVisibleEvidence(read().generation!, [evidenceB]); expect(reads()).toHaveLength(2);
  });
  it("zeigt dauerhafte historische Fehler generisch und verlorenen Inhalt ohne ACK", async () => {
    rest.handle = (call) => call.path === "organization/notices" ? jsonResponse({ sessionId: "a", items: [
      { id: "00000000-0000-4000-8000-000000000001", kind: "historical-decision-error", observedAt: now, completedAt: null, readEvidence: evidenceB },
      { id: "00000000-0000-4000-8000-000000000002", kind: "unavailable-content", observedAt: now, completedAt: null, readEvidence: null },
    ], hasMore: false, nextCursor: null, serverNow: now }) : null;
    await mount(); expect(read().notices).toHaveLength(2); expect(reads()).toHaveLength(0);
    expect(read().notices[0]?.text).toContain("ursprüngliche Fehlertext"); expect(read().notices[1]?.readEvidence).toBeNull();
    await read().onVisibleEvidence(read().generation!, [evidenceB]); expect(reads()).toHaveLength(1);
  });
  it("projiziert tatsächliche Livefehler und vollständige Completion ohne automatisches ACK", async () => {
    await mount([]);
    gateway.socket.event(event("session.error", 1, { code: "TURN_FAILED", message: "Entscheidung erforderlich", readEvidence: evidenceA }));
    expect(read().notices[0]).toMatchObject({ kind: "decision-error", text: "Entscheidung erforderlich", readEvidence: evidenceA });
    gateway.socket.event(event("message.completed", 2, { ...completed(), readEvidence: evidenceB }));
    expect(reads()).toHaveLength(0); await read().onVisibleEvidence(read().generation!, [evidenceB]); expect(reads()).toHaveLength(1);
  });
  it("batcht höchstens 64 exakte Handles und stoppt Folgechunks bei Flag-off", async () => {
    const handles = Array.from({ length: 70 }, (_, index) => index.toString(16).padStart(64, "0"));
    await mount(handles.map((handle, index) => row(index + 1, "echt gleich", { readEvidence: handle })));
    await read().onVisibleEvidence(read().generation!, handles);
    expect(reads().map((call) => (call.body!.evidence as string[]).length)).toEqual([64, 6]);
    expect(chat.store.get("a").messages).toHaveLength(70);
    useAppPreferences.setState({ hermesV2Enabled: false }); const count = reads().length;
    await read().onVisibleEvidence({} as NonNullable<ReturnType<typeof read>["generation"]>, handles); expect(reads()).toHaveLength(count);
  });
  it("drainiert B trotz noch hängendem alten Read A ohne weiteren Observerimpuls", async () => {
    await mount(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "organization/read" && call.body?.sessionId === "a" ? new Promise((resolve) => { release = resolve; }) : null;
    const previous = read().onVisibleEvidence(read().generation!, [evidenceA]); await settle();
    gateway.snapshots.set("b", snapshot("b", { messages: [row(2, "B", { readEvidence: evidenceB })] }));
    chat.actionsFor("one").selectSession("b"); org.update({ ownerId: "one", sessionId: "b", active: true, visible: true }); await settle();
    await read().onVisibleEvidence(read().generation!, [evidenceB]);
    expect(reads().map((call) => call.body?.sessionId)).toEqual(["a", "b"]);
    release(jsonResponse({ revision: 1, acknowledgedSources: 1, pendingSources: 0, readFactIds: [], serverNow: now })); await previous;
    expect(reads()).toHaveLength(2);
  });
  it("lässt gescheiterte Belegerneuerung sichtbar und einen ausdrücklichen frischen Read-Retry zu", async () => {
    await mount();
    rest.handle = (call) => call.path === "organization/read" ? jsonResponse({ code: "READ_EVIDENCE_EXPIRED" }, 410) : null;
    gateway.handle = (frame, socket) => {
      if (frame.op !== "history.read") return false;
      socket.receive({ v: 1, type: "error", id: frame.id, code: "GATEWAY_OFFLINE", message: "Abgleich derzeit nicht möglich", retryable: true, outcome: "not_sent" }); return true;
    };
    await read().onVisibleEvidence(read().generation!, [evidenceA]);
    expect(read().error?.code).toBe("GATEWAY_OFFLINE");
    gateway.handle = null; gateway.pages.set("a:0", [row(1, "Antwort", { readEvidence: evidenceB })]);
    await read().refresh(); expect(chat.store.get("a").messages[0]?.readEvidence).toBe(evidenceB); expect(read().error).toBeNull();
    expect(reads()).toHaveLength(1);
  });
  it("erneuert einen abgelaufenen Beleg auf älterer Historyseite und ACKt B erst sichtbar", async () => {
    gateway.pages.set("a:0", [row(3, "Neu")]);
    gateway.pages.set("a:1", [row(2, "echt gleicher Text", { readEvidence: evidenceA })]);
    await mount([]); await chat.actionsFor("one").loadOlder();
    expect(chat.store.get("a").messages.find((message) => message.rowId === 2)?.readOffset).toBe(1);
    gateway.pages.set("a:1", [row(2, "Erneuerte Projektion", { readEvidence: evidenceB })]);
    let attempts = 0;
    rest.handle = (call) => call.path === "organization/read" && attempts++ === 0 ? jsonResponse({ code: "READ_EVIDENCE_EXPIRED" }, 410) : null;
    await read().onVisibleEvidence(read().generation!, [evidenceA]);
    expect(reads()).toHaveLength(1);
    expect(chat.store.get("a").messages.map((message) => message.rowId)).toEqual([2, 3]);
    expect(chat.store.get("a").messages[0]).toMatchObject({ text: "Erneuerte Projektion", readEvidence: evidenceB, readOffset: 1 });
    await read().refresh(); expect(reads()).toHaveLength(1);
    await read().onVisibleEvidence(read().generation!, [evidenceB]); expect(reads()).toHaveLength(2);
    expect(reads()[1]?.body?.evidence).toEqual([evidenceB]);
  });
});
