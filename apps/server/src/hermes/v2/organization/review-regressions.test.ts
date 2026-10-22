import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { integrationFixture } from "./integration-fixture.js";
import { organizationFixture, rawRow, uid } from "./test-fixture.js";
import { OrganizationReconciler } from "./reconcile.js";
import { confirmLineage } from "./lineage.js";
import { linkEqual, rowWitness } from "./sources.js";
import { normalizeEvent } from "../normalize-events.js";
import { normalizeSession } from "../normalize-sessions.js";
import type { SessionRecord } from "../types.js";

function record(id: string): SessionRecord {
  return { storedId: id, canonicalId: id, liveId: "live", epoch: "epoch",
    snapshot: { session: normalizeSession(id, {}), epoch: "epoch", cursor: 0, writable: true,
      blockedReason: null, selection: null, reasoningEffort: null, running: false, turnStartedAt: null,
      inflight: null, queuedText: null, requests: [], messages: [] }, ownedBinding: null, turnId: "turn",
    seq: 0, hydrating: false, buffered: [], bufferedBytes: 0, backgroundActive: false,
    profileName: "default", subscribers: new Set() };
}

describe("gesunde Gegenproben des unabhängigen Backendreviews", () => {
  it("H1: History-Row-Reuse lässt einen zuvor gelesenen UID-Zeugen keine neue Liveantwort lesen", async () => {
    const f = await integrationFixture();
    try {
      const session = f.core.seed("session"); session.messages = [rawRow(1)];
      const { manager, messages } = f.browser();
      const service = f.pool.organization!; const scope = await service.context();
      await manager.handle("a", f.message({ op: "session.subscribe", sessionId: session.id }));
      const snapshot = messages.find((frame) => frame.type === "result" && frame.op === "session.subscribe");
      if (snapshot?.type !== "result" || snapshot.op !== "session.subscribe") throw new Error("Snapshot fehlt");
      expect((await f.request("/hermes/v2/organization/read", { sessionId: session.id,
        evidence: [snapshot.data.snapshot.messages[0]!.readEvidence] })).statusCode).toBe(200);
      f.core.event(session, "message.complete", { text: "Antwort 1", persisted_turn: { complete: true, final_assistant_row_id: 1 } });
      await expect.poll(() => service.repo.facts(scope.id, session.id).length).toBe(1);
      const first = service.repo.facts(scope.id, session.id)[0]!;
      expect(service.repo.acknowledged("a", first.id)).toBe(true);
      session.messages = [rawRow(1, { message_uid: uid(2), content: "Neue ungelesene Antwort" })];
      await manager.handle("a", { v: 1, id: randomUUID(), op: "history.read", sessionId: session.id, limit: 100, offset: 0 });
      expect(service.repo.coverage(scope.id, session.id).reason).toBe("ROW_IDENTITY_CHANGED");
      const seq = session.seq + 1;
      f.core.event(session, "message.complete", { text: "Neue ungelesene Antwort", persisted_turn: { complete: true, final_assistant_row_id: 1 } });
      await expect.poll(() => service.repo.facts(scope.id, session.id).length).toBe(2);
      const fresh = service.repo.one<{ id: string }>("SELECT id FROM hermes_v2_sources WHERE scope=? AND source_key=?",
        scope.id, `event:${f.core.epoch}:${session.liveId}:${seq}`)!;
      expect(service.repo.acknowledged("a", fresh.id)).toBe(false);
      expect(service.repo.acknowledged("a", first.id)).toBe(true);
      expect((await f.request("/hermes/v2/organization?sessionId=session")).json()[0].attention.unreadCount).toBe(1);
    } finally { await f.close(); }
  });

  it("H1: Row-Konflikte bleiben nach DB-Wiederöffnung und in weiteren Sessionprojektionen gesperrt", async () => {
    const f = await organizationFixture();
    try {
      f.project([rawRow(1)], "a", "root");
      f.project([rawRow(1)], "a", "copy");
      expect(rowWitness(f.repo, f.scope.id, "copy", 1)).toBe(uid(1));
      f.project([rawRow(1, { message_uid: uid(2) })], "a", "root");
      f.repo.close();
      expect(rowWitness(f.repo, f.scope.id, "root", 1)).toBeNull();
      expect(rowWitness(f.repo, f.scope.id, "copy", 1)).toBeNull();
      expect(f.project([rawRow(1)], "a", "root").messages[0]!.readEvidence).toBeNull();
      expect(f.project([rawRow(2)], "a", "other").messages[0]!.readEvidence).toBeTruthy();
    } finally { await f.close(); }
  });

  it("M1: gemischte UID-Lücken bleiben sichtbar und revisionsstabil, neue ungeklärte Rows ändern die Coverage", async () => {
    const f = await organizationFixture();
    let rows: unknown[] = [rawRow(1)];
    const reconciler = new OrganizationReconciler(f.repo, { token: { get: async () => "", invalidate() {} },
      get: async () => ({ session_id: "session", profile: "default", messages: rows }) }, () => {}, f.now);
    try {
      await reconciler.scan(f.scope, "session");
      rows.push(rawRow(2, { message_uid: null }));
      await reconciler.scan(f.scope, "session");
      const first = f.view();
      expect(first.coverage).toMatchObject({ state: "identity-unknown", reason: "MESSAGE_IDENTITY_MISSING", revision: 1 });
      expect(first.attention.requiresAttention).toBe(true);
      expect(f.repo.facts(f.scope.id, "session")).toHaveLength(0);
      await reconciler.scan(f.scope, "session");
      expect(f.view().coverage.revision).toBe(first.coverage.revision);
      rows.push(rawRow(3, { message_uid: null }));
      await reconciler.scan(f.scope, "session");
      expect(f.view().coverage.revision).toBe(first.coverage.revision + 1);
      rows = [rawRow(1), rawRow(2), rawRow(3)];
      await reconciler.scan(f.scope, "session");
      expect(f.view().coverage.state).toBe("anchored");
      expect(f.repo.facts(f.scope.id, "session")).toHaveLength(2);
    } finally { reconciler.stop(); await f.close(); }
  });

  it("M1: UID-lose User-/Tool-/Zwischenrows sind kein erfundener fehlender Abschluss", async () => {
    const f = await organizationFixture();
    const rows = [rawRow(1), rawRow(2, { role: "user", message_uid: null }),
      rawRow(3, { message_uid: null, tool_calls: [{ id: "call" }] }), rawRow(4, { message_uid: null, display_kind: "hidden" })];
    const reconciler = new OrganizationReconciler(f.repo, { token: { get: async () => "", invalidate() {} },
      get: async () => ({ session_id: "session", profile: "default", messages: rows }) }, () => {}, f.now);
    try {
      await reconciler.scan(f.scope, "session");
      expect(f.view().coverage.state).toBe("baseline");
      expect(f.view().attention.requiresAttention).toBe(false);
    } finally { reconciler.stop(); await f.close(); }
  });

  it("M2: zwei explizite Livebeweise derselben Row/UID behalten Fakt, Read und Settle", async () => {
    const f = await integrationFixture();
    try {
      const session = f.core.seed("session"); session.messages = [rawRow(1)];
      const { manager, messages } = f.browser();
      const service = f.pool.organization!; const scope = await service.context();
      await manager.handle("a", f.message({ op: "session.subscribe", sessionId: session.id }));
      const payload = { text: "Antwort 1", persisted_turn: { complete: true, final_assistant_row_id: 1 } };
      f.core.event(session, "message.complete", payload);
      await expect.poll(() => messages.filter((frame) => frame.type === "event" && frame.event.type === "message.completed").length).toBe(1);
      const first = messages.find((frame) => frame.type === "event" && frame.event.type === "message.completed");
      if (first?.type !== "event" || first.event.type !== "message.completed") throw new Error("Abschluss fehlt");
      await f.request("/hermes/v2/organization/read", { sessionId: session.id, evidence: [first.event.payload.readEvidence] });
      const before = (await f.request("/hermes/v2/organization?sessionId=session")).json()[0];
      await f.request("/hermes/v2/organization/action", { sessionId: session.id, expectedRevision: before.revision, action: "settle" });
      const fact = service.repo.facts(scope.id, session.id)[0]!;
      f.core.event(session, "message.complete", payload);
      await expect.poll(() => messages.filter((frame) => frame.type === "event" && frame.event.type === "message.completed").length).toBe(2);
      expect(service.repo.facts(scope.id, session.id)).toMatchObject([{ fact_id: fact.fact_id, change_cursor: fact.change_cursor }]);
      const after = (await f.request("/hermes/v2/organization?sessionId=session")).json()[0];
      expect(after.effectiveSettledAt).not.toBeNull();
      expect(after.attention.unreadCount).toBe(0);
      expect(after.attention.requiresAttention).toBe(false);
    } finally { await f.close(); }
  });

  it("M2/M4: EQUAL-Komponenten kanonisieren alte Fakten und Reads, COVERS bleibt gerichtet getrennt", async () => {
    const f = await organizationFixture();
    try {
      const a = f.source(1); const b = f.source(2); const canonical = f.source(3); const covered = f.source(4);
      f.repo.transaction(() => { f.repo.fact(a, "new-answer", f.now()); f.repo.fact(b, "live-turn-end", f.now()); });
      const original = f.repo.facts(f.scope.id, "session").at(-1)!;
      const evidence = f.evidence.evidence("a", f.scope.id, "session", [b.id]);
      if (!evidence) throw new Error("Lesebeleg fehlt");
      f.read([evidence]);
      f.repo.transaction(() => {
        linkEqual(f.repo, a, canonical, f.now()); linkEqual(f.repo, b, canonical, f.now());
        f.repo.run("INSERT INTO hermes_v2_source_links VALUES(?,?,'covers')", canonical.id, covered.id);
        f.repo.fact(canonical, "new-answer", f.now());
      });
      expect(f.repo.facts(f.scope.id, "session")).toMatchObject([{ fact_id: original.fact_id, change_cursor: original.change_cursor, kind: "live-turn-end" }]);
      expect(f.repo.acknowledged("a", a.id)).toBe(true);
      expect(f.repo.acknowledged("b", a.id)).toBe(false);
      expect(f.repo.acknowledged("a", covered.id)).toBe(false);
      expect(f.view().attention.unreadCount).toBe(0);
    } finally { await f.close(); }
  });

  it("M3: echte Service-Eviction und Wiederverfügbarkeit wecken Root und Tip dauerhaft, auch nach Read", async () => {
    const f = await integrationFixture();
    try {
      const service = f.pool.organization!; const scope = await service.context();
      confirmLineage(service.repo, scope.id, { id: "tip", _lineage_root_id: "root", _lineage_ids: ["root", "tip"] }, Date.now());
      const raw = { type: "message.complete", session_id: "live", seq: 10, payload: { text: "Originale Liveantwort" } };
      for (const id of ["root", "tip"]) { const rec = record(id); service.observe(rec, raw, normalizeEvent(raw, rec)!); }
      await f.request("/hermes/v2/organization?sessionId=root&sessionId=tip");
      service.replayEvicted(record("root"), 11);
      for (const id of ["root", "tip"]) {
        const before = (await f.request(`/hermes/v2/organization?sessionId=${id}`)).json()[0];
        service.actions.action("a", scope.id, { sessionId: id, expectedRevision: before.revision,
          action: "snooze", snoozedUntil: Date.now() + 3600_000 });
      }
      const tip = record("tip"); const normalized = normalizeEvent(raw, tip)!;
      service.observe(tip, raw, normalized);
      const frame = service.frame("a", { v: 1, type: "event", event: normalized }, true);
      if (frame.type !== "event" || frame.event.type !== "message.completed") throw new Error("Abschluss fehlt");
      expect(frame.event.payload.readEvidence).toBeTruthy();
      await f.request("/hermes/v2/organization/read", { sessionId: "tip", evidence: [frame.event.payload.readEvidence] });
      for (const id of ["root", "tip"]) {
        const after = (await f.request(`/hermes/v2/organization?sessionId=${id}`)).json()[0];
        expect(after.coverage).toMatchObject({ revision: 2, reason: "CONTENT_AVAILABLE" });
        expect(after.effectiveSnoozedUntil).toBeNull();
        expect(after.attention.requiresAttention).toBe(true);
      }
    } finally { await f.close(); }
  });

  it("M3: unterschiedliche Coverage-Zahlen bleiben projektspezifisch und erneutes Snooze wirkt", async () => {
    const f = await organizationFixture();
    try {
      f.project([rawRow(1)], "a", "root");
      f.repo.transaction(() => f.repo.fact(f.source(1, "root"), "new-answer", f.now()));
      confirmLineage(f.repo, f.scope.id, { id: "tip", _lineage_root_id: "root", _lineage_ids: ["root", "tip"] }, f.now());
      f.project([rawRow(100, { message_uid: uid(1) })], "a", "tip");
      f.repo.transaction(() => {
        for (let i = 0; i < 5; i++) f.repo.setCoverage(f.scope.id, "root", "gap", "ANCHOR_MISSING", String(i), f.now());
        f.repo.setCoverage(f.scope.id, "tip", "gap", "UNAVAILABLE_CONTENT", "lost", f.now());
        f.repo.run("UPDATE hermes_v2_sources SET available=0 WHERE id=?", f.source(1, "root").id);
      });
      f.project([rawRow(100, { message_uid: uid(1) })], "a", "tip");
      expect(f.view("a", "root").coverage.revision).toBe(6);
      expect(f.view("a", "tip").coverage.revision).toBe(2);
      const before = f.view("a", "tip");
      f.actions.action("a", f.scope.id, { sessionId: "tip", expectedRevision: before.revision, action: "snooze", snoozedUntil: f.now() + 3600_000 });
      expect(f.view("a", "tip").attention.unreadCount).toBe(0);
      expect(f.view("a", "tip").effectiveSnoozedUntil).not.toBeNull();
    } finally { await f.close(); }
  });

  it("M4: ACK invalidiert alle eigenen UID-Projektionen einmal, andere Owners bleiben unverändert", async () => {
    const f = await organizationFixture();
    try {
      f.project([rawRow(1)], "a", "root");
      f.repo.transaction(() => f.repo.fact(f.source(1, "root"), "new-answer", f.now()));
      const tip = f.project([rawRow(100, { message_uid: uid(1) })], "a", "tip");
      // Vor bestätigter Lineage existieren zwei Sources. Der ausgegebene Tiphandle bleibt eingefroren.
      confirmLineage(f.repo, f.scope.id, { id: "tip", _lineage_root_id: "root", _lineage_ids: ["root", "tip"] }, f.now());
      const before = ["a", "b"].flatMap((owner) => ["root", "tip"].map((id) => ({ owner, id, view: f.view(owner, id) })));
      const changes = f.changes.length;
      f.read([f.handle(tip.messages[0]!)], "a", "tip");
      for (const item of before) {
        const after = f.view(item.owner, item.id);
        expect(after.revision).toBe(item.view.revision + (item.owner === "a" ? 1 : 0));
        expect(after.attention.unreadCount).toBe(item.owner === "a" ? 0 : 1);
      }
      expect(f.changes.slice(changes).map((change) => `${change.owner}:${change.session}`).sort()).toEqual(["a:root", "a:tip"]);
    } finally { await f.close(); }
  });

  it("M3: zwei nacheinander wieder verfügbare Quellen wecken auch zwischen zwei bewussten Snoozes", async () => {
    const f = await organizationFixture();
    try {
      f.project([rawRow(1), rawRow(2)]); f.fact(1); f.fact(2);
      f.repo.transaction(() => {
        f.repo.run("UPDATE hermes_v2_sources SET available=0");
        f.repo.setCoverage(f.scope.id, "session", "gap", "UNAVAILABLE_CONTENT", "lost", f.now());
      });
      f.project([rawRow(1)]);
      const before = f.view();
      f.actions.action("a", f.scope.id, { sessionId: "session", expectedRevision: before.revision,
        action: "snooze", snoozedUntil: f.now() + 3600_000 });
      const second = f.project([rawRow(2)]);
      expect(f.view().coverage.revision).toBe(before.coverage.revision + 1);
      f.read([f.handle(second.messages[0]!)]);
      expect(f.view().effectiveSnoozedUntil).toBeNull();
    } finally { await f.close(); }
  });

  it("M5: eine an5000 gekürzte letzte Seite zeigt verbleibende Rows ehrlich als partial", async () => {
    const f = await integrationFixture();
    try {
      let total = 5025;
      f.custom((path) => path.startsWith("/api/profiles/sessions?") ? {
        sessions: Array.from({ length: 50 }, (_, i) => ({ id: `id-${4950 + i}`, profile: "default" })), total,
      } : undefined);
      const truncated = (await f.request("/hermes/v2/sessions?offset=4950&limit=100")).json();
      expect(truncated.sessions).toHaveLength(50);
      expect(truncated).toMatchObject({ hasMore: true, nextOffset: null, coverage: "partial", limit: 100 });
      total = 5000;
      expect((await f.request("/hermes/v2/sessions?offset=4950&limit=100")).json())
        .toMatchObject({ hasMore: false, nextOffset: null, coverage: "complete" });
    } finally { await f.close(); }
  });
});
