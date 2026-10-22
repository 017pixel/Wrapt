import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrganizationReconciler } from "./reconcile.js";
import { organizationFixture, rawRow, uid } from "./test-fixture.js";
import { confirmLineage } from "./lineage.js";

describe("begrenzter nativer Antwortabgleich", () => {
  let f: Awaited<ReturnType<typeof organizationFixture>>;
  let rows: unknown[];
  let paths: string[];
  let reconcile: OrganizationReconciler;
  beforeEach(async () => {
    f = await organizationFixture(); rows = []; paths = [];
    reconcile = new OrganizationReconciler(f.repo, { token: { get: async () => "unused", invalidate() {} }, get: async (path) => {
      paths.push(path); const params = new URL(path, "http://fake").searchParams;
      const end = Math.max(0, rows.length - Number(params.get("offset")));
      return { profile: "default", session_id: "session", messages: rows.slice(Math.max(0, end - 64), end) };
    } }, () => {}, f.now);
  });
  afterEach(async () => { reconcile.stop(); await f.close(); });
  it("erste alte History ist nur Baseline; neue terminale Antwort nach Anchor wird erkannt", async () => {
    rows = [rawRow(1)]; await reconcile.scan(f.scope, "session");
    expect(f.view().attention.unreadCount).toBe(0);
    expect(f.view().coverage.state).toBe("baseline");
    rows.push(rawRow(2)); await reconcile.scan(f.scope, "session");
    expect(f.view()).toMatchObject({ coverage: { state: "anchored" }, attention: { unreadCount: 1, latest: { kind: "new-answer" } } });
    expect(paths.every((path) => path.includes("limit=64") && path.includes("inline_images=false") && path.includes("profile=default"))).toBe(true);
  });
  it.each([
    { finish_reason: "length" }, { finish_reason: "incomplete" }, { finish_reason: "verification_required" },
    { finish_reason: "verify_hook_continue" }, { finish_reason: "kanban_terminal_required" }, { finish_reason: null },
    { tool_calls: [{ id: "tool" }] }, { content: "" }, { display_kind: "hidden" }, { display_kind: "summary" },
    { display_kind: "commentary" }, { display_kind: "scaffold" }, { message_uid: null },
  ])("Verification/Tool/Recovery/Scaffold erzeugt keinen falschen Abschluss: %j", async (patch) => {
    rows = [rawRow(1)]; await reconcile.scan(f.scope, "session");
    rows.push(rawRow(2, patch)); await reconcile.scan(f.scope, "session");
    expect(f.repo.facts(f.scope.id, "session")).toHaveLength(0);
  });
  it("gleiche UID mit neuer Row ist keine neue Antwort, zwei gleiche Texte mit verschiedenen UIDs schon", async () => {
    rows = [rawRow(1, { content: "gleich" })]; await reconcile.scan(f.scope, "session");
    rows = [rawRow(100, { content: "gleich", message_uid: uid(1) }), rawRow(2, { content: "gleich" })];
    await reconcile.scan(f.scope, "session");
    expect(f.repo.facts(f.scope.id, "session")).toHaveLength(1);
  });
  it("fehlender Anchor liest höchstens zwei64er-Seiten und gleicher Gap bleibt revisionsstabil", async () => {
    rows = [rawRow(1)]; await reconcile.scan(f.scope, "session");
    rows = Array.from({ length: 180 }, (_, index) => rawRow(index + 2));
    paths = []; await reconcile.scan(f.scope, "session");
    expect(paths).toHaveLength(2);
    expect(f.view()).toMatchObject({ coverage: { state: "gap", reason: "ANCHOR_MISSING" }, attention: { unreadCount: 0 } });
    const revision = f.view().coverage.revision;
    await reconcile.scan(f.scope, "session");
    expect(f.view().coverage.revision).toBe(revision);
  });
  it("cursor-only Livefakt wird nicht an letzte Historyrow geraten oder als zweiter Abschluss erfunden", async () => {
    rows = [rawRow(1)]; await reconcile.scan(f.scope, "session");
    f.repo.transaction(() => f.repo.fact(f.repo.source(f.scope.id, "session", "answer", "event:e:l:1", { epoch: "e", live_id: "l", seq: 1 }), "live-turn-end", f.now()));
    rows.push(rawRow(2)); await reconcile.scan(f.scope, "session");
    expect(f.repo.facts(f.scope.id, "session")).toHaveLength(1);
    expect(f.view().coverage.reason).toBe("UNRESOLVED_LIVE_OVERLAP");
  });
  it("Root/Tip verbindet nur bewiesene Compression, Branch und private Organisation bleiben getrennt", () => {
    f.project([rawRow(1)], "a", "root");
    f.repo.transaction(() => f.repo.fact(f.source(1, "root"), "new-answer", f.now()));
    f.repo.metadata("a", f.scope.id, "root", f.now());
    f.actions.action("a", f.scope.id, { sessionId: "root", expectedRevision: 0, action: "pin" });
    confirmLineage(f.repo, f.scope.id, { id: "tip", _lineage_root_id: "root", _lineage_ids: ["root", "tip"] }, f.now());
    const tip = f.project([rawRow(100, { message_uid: uid(1) })], "a", "tip");
    f.read([f.handle(tip.messages[0]!)], "a", "tip");
    expect(f.repo.acknowledged("a", f.source(1, "root").id)).toBe(true);
    expect(f.view("a", "tip").pinRank).toBeNull();
    const branch = f.project([rawRow(200, { message_uid: uid(1) })], "a", "branch");
    const branchSource = f.evidence.get(f.handle(branch.messages[0]!), "a", f.scope.id, "branch")[0]!;
    expect(f.repo.acknowledged("a", branchSource)).toBe(false);
  });
  it("Row-Reuse/Restore bleibt identity-unknown, späterer Scan löscht den Konflikt nicht", async () => {
    rows = [rawRow(1)]; await reconcile.scan(f.scope, "session");
    rows = [rawRow(1, { message_uid: uid(2) })]; await reconcile.scan(f.scope, "session");
    expect(f.view().coverage.reason).toBe("ROW_IDENTITY_CHANGED");
    await reconcile.scan(f.scope, "session");
    expect(f.view().coverage.state).toBe("identity-unknown");
  });
  it("zwei Worker und512Dirty begrenzen Bursts, kein automatischer weiterer64erRead nach Flagoff", async () => {
    let active = true; let inflight = 0; let peak = 0;
    const pending: Array<() => void> = [];
    const scheduler = new OrganizationReconciler(f.repo, { token: { get: async () => "", invalidate() {} }, get: async () => {
      inflight++; peak = Math.max(peak, inflight);
      await new Promise<void>((resolve) => pending.push(resolve)); inflight--;
      return { profile: "default", session_id: "session", messages: [rawRow(2)] };
    } }, () => {}, f.now, () => active);
    scheduler.enqueue(f.scope, Array.from({ length: 520 }, (_, index) => index < 2 ? "session" : `session${index}`));
    await Promise.resolve(); expect(peak).toBe(2);
    active = false; for (const resolve of pending) resolve();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(peak).toBe(2);
    scheduler.stop();
    expect(f.repo.one<{ count: number }>("SELECT COUNT(*) count FROM hermes_v2_reconciliation WHERE reason='RECONCILIATION_OVERFLOW'")!.count).toBeGreaterThan(0);
  });
  it("dieselbe Session wird bei erneutem Anlass während eines Reads nie parallel abgeglichen", async () => {
    let active = 0; let peak = 0;
    const pending: Array<() => void> = [];
    const one = new OrganizationReconciler(f.repo, { token: { get: async () => "", invalidate() {} }, get: async () => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>((resolve) => pending.push(resolve)); active--;
      return { profile: "default", session_id: "session", messages: [] };
    } }, () => {}, f.now);
    one.enqueue(f.scope, ["session"]); one.enqueue(f.scope, ["session"]);
    expect(pending).toHaveLength(1);
    pending.shift()!(); await new Promise((resolve) => setTimeout(resolve, 5));
    expect(peak).toBe(1);
    one.stop(); pending.shift()?.(); await new Promise((resolve) => setTimeout(resolve, 5));
  });
});
