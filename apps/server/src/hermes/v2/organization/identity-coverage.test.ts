import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OrganizationReconciler } from "./reconcile.js";
import { organizationFixture, rawRow, uid } from "./test-fixture.js";
import { rowWitness } from "./sources.js";

describe("zusammengesetzte Identitätsabdeckung", () => {
  let f: Awaited<ReturnType<typeof organizationFixture>>;
  let rows: unknown[];
  let reconcile: OrganizationReconciler;
  beforeEach(async () => {
    f = await organizationFixture(); rows = [rawRow(1), rawRow(2)];
    reconcile = new OrganizationReconciler(f.repo, { token: { get: async () => "", invalidate() {} },
      get: async () => ({ session_id: "session", profile: "default", messages: rows }) }, () => {}, f.now);
    await reconcile.scan(f.scope, "session");
  });
  afterEach(async () => { reconcile.stop(); await f.close(); });
  const scan = async () => { await reconcile.scan(f.scope, "session"); return f.view(); };
  function organize(action: "settle" | "snooze") {
    const input = { sessionId: "session", expectedRevision: f.view().revision };
    if (action === "settle") f.actions.action("a", f.scope.id, { ...input, action });
    else f.actions.action("a", f.scope.id, { ...input, action, snoozedUntil: f.now() + 3600_000 });
  }

  it("bekannter Rowkonflikt verdeckt keine neue UID-lose Antwort und identische Folgescans bleiben stabil", async () => {
    const beforeOutput = f.project(rows);
    const handle = f.handle(beforeOutput.messages.find((message) => message.rowId === 2)!);
    f.read([handle]);
    const oldSource = f.source(2);
    rows = [rawRow(1, { message_uid: uid(3) }), rawRow(2)];
    const conflict = await scan();
    expect(conflict.coverage).toMatchObject({ revision: 1, reason: "ROW_IDENTITY_CHANGED" });
    organize("settle");
    rows.push(rawRow(4, { message_uid: null }));
    const changed = await scan();
    expect(changed.coverage.revision).toBe(conflict.coverage.revision + 1);
    expect(changed.attention.requiresAttention).toBe(true);
    expect(changed.effectiveSettledAt).toBeNull();
    expect(f.repo.facts(f.scope.id, "session")).toHaveLength(0);
    expect(f.repo.one("SELECT 1 FROM hermes_v2_row_witnesses WHERE scope=? AND row_id=4", f.scope.id)).toBeUndefined();
    expect(f.repo.acknowledged("a", oldSource.id)).toBe(true);
    expect(f.repo.acknowledged("b", oldSource.id)).toBe(false);
    f.read([handle]);
    expect(f.view().effectiveSettledAt).toBeNull();
    for (let repeat = 0; repeat < 4; repeat++) {
      const next = await scan();
      expect(next.coverage.revision).toBe(changed.coverage.revision);
      expect(next.attention.requiresAttention).toBe(true);
    }
  });

  it("inverse Reihenfolge erhält beide Ursachen; erneutes Snooze wirkt bis zu weiterem unbekanntem Material", async () => {
    rows.push(rawRow(4, { message_uid: null }));
    const missing = await scan();
    expect(missing.coverage).toMatchObject({ reason: "MESSAGE_IDENTITY_MISSING", revision: 1 });
    organize("snooze");
    rows[0] = rawRow(1, { message_uid: uid(3) });
    const combined = await scan();
    expect(combined.coverage.revision).toBe(missing.coverage.revision + 1);
    expect(combined.effectiveSnoozedUntil).toBeNull();
    organize("snooze");
    const organized = f.view();
    expect(organized.effectiveSnoozedUntil).not.toBeNull();
    for (const value of [uid(1), null, uid(3)]) {
      rows[0] = rawRow(1, { message_uid: value });
      expect((await scan()).coverage.revision).toBe(combined.coverage.revision);
      expect(f.view().effectiveSnoozedUntil).toBe(organized.effectiveSnoozedUntil);
    }
    rows.push(rawRow(5, { message_uid: null }));
    const next = await scan();
    expect(next.coverage.revision).toBe(combined.coverage.revision + 1);
    expect(next.effectiveSnoozedUntil).toBeNull();
    expect(f.repo.facts(f.scope.id, "session")).toHaveLength(0);
  });

  it("kombinierte Materialmenge übersteht DB-Reopen, Reihenfolge und vorübergehend kleinere Historyseite", async () => {
    rows = [rawRow(1, { message_uid: uid(3) }), rawRow(2), rawRow(4, { message_uid: null })];
    const known = await scan();
    organize("settle");
    const settled = f.view().effectiveSettledAt;
    f.repo.close();
    for (const current of [
      [rawRow(4, { message_uid: null }), rawRow(2), rawRow(1)],
      [rawRow(1), rawRow(2)],
      [rawRow(1, { message_uid: null }), rawRow(2), rawRow(4, { message_uid: null })],
    ]) {
      rows = current;
      expect((await scan()).coverage.revision).toBe(known.coverage.revision);
      expect(f.view().effectiveSettledAt).toBe(settled);
      expect(rowWitness(f.repo, f.scope.id, "session", 1)).toBeNull();
    }
    rows[1] = rawRow(2, { message_uid: uid(6) });
    const newConflict = await scan();
    expect(newConflict.coverage.revision).toBe(known.coverage.revision + 1);
    expect(newConflict.effectiveSettledAt).toBeNull();
    expect(rowWitness(f.repo, f.scope.id, "session", 2)).toBeNull();
    f.repo.close();
    expect((await scan()).coverage.revision).toBe(newConflict.coverage.revision);
    expect(f.repo.facts(f.scope.id, "session")).toHaveLength(0);
  });

  it("mehrere ungeklärte Rows werden gemeinsam neu erkannt; bekannte Duplikate und Zwischenrows wecken nicht", async () => {
    rows = [rawRow(1, { message_uid: uid(3) }), rawRow(2)];
    await scan(); organize("snooze");
    const revision = f.view().coverage.revision;
    rows.push(rawRow(4, { message_uid: null }), rawRow(5, { message_uid: null }));
    const changed = await scan();
    expect(changed.coverage.revision).toBe(revision + 1);
    expect(changed.effectiveSnoozedUntil).toBeNull();
    organize("snooze");
    rows.push(rawRow(4, { message_uid: null }), rawRow(6, { role: "user", message_uid: null }),
      rawRow(7, { message_uid: null, tool_calls: [{ id: "call" }] }));
    expect((await scan()).coverage.revision).toBe(changed.coverage.revision);
    expect(f.view().effectiveSnoozedUntil).not.toBeNull();
    expect(f.repo.facts(f.scope.id, "session")).toHaveLength(0);
    expect(f.repo.one<{ count: number }>("SELECT COUNT(*) count FROM hermes_v2_read_acks")!.count).toBe(0);
  });
});
