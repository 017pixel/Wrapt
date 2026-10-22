// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAppPreferences } from "../../../stores/appPreferences";
import { ChatRuntime } from "./chat-runtime";
import { OrganizationClient } from "./organization-client";
import { OrganizationRuntime } from "./organization-runtime";
import { TestGateway, event, settle, snapshot } from "./chat-test-fixtures";
import { TestOrganization, jsonResponse, metadata, now } from "./organization-test-fixtures";

describe("Projektmitgliedschaft je bestätigtem Anfragekontext", () => {
  let chat: ChatRuntime, org: OrganizationRuntime, gateway: TestGateway, rest: TestOrganization;
  const options = { ownerId: "project", projectId: "p", active: true, visible: true };
  const view = () => org.getView("project");
  const page = (projectId: string | null, sessions = rest.sessions) => jsonResponse({
    sessions: sessions.map((session) => ({ ...session, projectId })), activity: {}, offset: 0, limit: 100,
    nextOffset: null, hasMore: false, coverage: "complete", serverNow: now,
  });
  async function mount() { org.acquire(options); await settle(); }
  beforeEach(() => {
    vi.useFakeTimers(); useAppPreferences.setState({ hermesV2Enabled: true }); gateway = new TestGateway(); rest = new TestOrganization();
    rest.sessions = [{ ...snapshot().session, cwd: "/project" }];
    rest.handle = (call) => call.path === "sessions" ? page(call.query.get("projectId")) : null;
    chat = new ChatRuntime(gateway.createClient()); org = new OrganizationRuntime(chat, new OrganizationClient(rest.fetch));
  });
  afterEach(() => { org.dispose(); chat.dispose("v2-disabled"); useAppPreferences.setState({ hermesV2Enabled: false }); vi.useRealTimers(); });
  it("erhält Projektrow bei neuer allgemeiner Sidebar und projiziert Projektfelder nur im jeweiligen Kontext", async () => {
    await mount(); org.acquire({ ownerId: "global", active: true }); await settle();
    expect(view().rows.map((row) => [row.id, row.projectId])).toEqual([["a", "p"]]);
    expect(org.getView("global").rows.map((row) => [row.id, row.projectId])).toEqual([["a", null]]);
  });
  it("nennt bestätigte Projektzuordnungen für den Projektfilter", async () => {
    // Im allgemeinen Kontext zeigen die Zeilen keine Projektkennung. Die
    // Auswahlliste des Filters kommt aus den bestätigten Zuordnungen,
    // sonst wäre sie leer und der Filter unbenutzbar.
    await mount();
    org.acquire({ ownerId: "global", active: true });
    await settle();
    expect(view().projects.map((entry) => entry.id)).toEqual(["p"]);
    expect(org.getView("global").projects.map((entry) => entry.id)).toEqual(["p"]);
  });

  it("erlaubt dieselbe CWD in zwei unabhängig bestätigten verschachtelten Projekten", async () => {
    await mount(); org.acquire({ ownerId: "nested", projectId: "q", active: true }); await settle();
    expect(view().rows.map((row) => [row.id, row.projectId])).toEqual([["a", "p"]]);
    expect(org.getView("nested").rows.map((row) => [row.id, row.projectId])).toEqual([["a", "q"]]);
  });
  it("bewahrt Projektbeleg bei Metadata-Invalidierung und bekanntem Lookup mit projectId=null", async () => {
    await mount(); chat.acquire({ ownerId: "chat", sessionId: "other", active: true, onSelectSession: vi.fn() }); await settle();
    rest.items.set("a", metadata("a", { revision: 1, pinRank: 0 }));
    gateway.socket.event(event("metadata.invalidated", null, { sessionId: "a", revision: 1 })); await settle();
    expect(view().rows[0]).toMatchObject({ id: "a", projectId: "p", pinned: true });
    expect(org.state.sessions.get("a")?.projectId).toBeNull();
  });
  it("entwertet CWD-Wechsel dauerhaft bis zur erneuten validierten Projektseite", async () => {
    await mount(); rest.sessions = [{ ...snapshot().session, cwd: "/outside" }];
    await org.queries.lookup(["a"], true); org.emitAll(); expect(view().rows).toHaveLength(0);
    rest.sessions = [{ ...snapshot().session, cwd: "/project" }];
    await org.queries.lookup(["a"], true); org.emitAll(); expect(view().rows).toHaveLength(0);
    await view().refresh(); expect(view().rows.map((row) => row.id)).toEqual(["a"]);
  });
  it("entwertet Missing trotz privatem Pin und übernimmt Wiederverfügbarkeit erst nach eigener Projektbestätigung", async () => {
    rest.items.set("a", metadata("a", { pinRank: 0 })); await mount(); rest.sessions = [];
    await org.queries.lookup(["a"], true); org.emitAll(); expect(view().rows).toHaveLength(0);
    expect(org.state.metadata.get("a")?.pinRank).toBe(0);
    rest.sessions = [{ ...snapshot().session, cwd: "/project" }];
    await org.queries.lookup(["a"], true); org.emitAll(); expect(view().rows).toHaveLength(0);
    await view().refresh(); expect(view().rows[0]).toMatchObject({ id: "a", pinned: true, projectId: "p" });
  });
  it("verwirft den alten Projektrequest nach Ownerprojektwechsel und erbt keine Mitgliedschaft", async () => {
    await mount(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path !== "sessions" ? null : call.query.get("projectId") === "p"
      ? new Promise((resolve) => { release = resolve; }) : page("q", []);
    const old = org.queries.catalog(org.owners.get("project")!, true);
    org.update({ ...options, projectId: "q" }); await settle();
    release(page("p")); await old; expect(view().rows).toHaveLength(0); expect(org.owners.get("project")?.projectMembers.size).toBe(0);
  });
  it("bestätigt keine alte Projektprojektion nach nativem CWD-Wechsel und Rückkehr während des Requests", async () => {
    await mount(); let release!: (response: Response) => void;
    rest.handle = (call) => call.path === "sessions" ? new Promise((resolve) => { release = resolve; }) : null;
    const old = org.queries.catalog(org.owners.get("project")!, true);
    chat.upsertSummary({ ...snapshot().session, cwd: "/outside" });
    chat.upsertSummary({ ...snapshot().session, cwd: "/project" });
    release(page("p")); await old; expect(view().rows).toHaveLength(0);
    rest.handle = (call) => call.path === "sessions" ? page(call.query.get("projectId")) : null;
    await view().refresh(); expect(view().rows.map((row) => row.id)).toEqual(["a"]);
  });
  it("weist ungefragte Projektlabels in einer ansonsten gültigen Antwort zurück", async () => {
    for (const projectId of [null, "q"]) {
      const client = new OrganizationClient(async () => page(projectId));
      await expect(client.catalog({ offset: 0, limit: 100, projectId: "p" }, new AbortController().signal)).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH" });
    }
  });
});
