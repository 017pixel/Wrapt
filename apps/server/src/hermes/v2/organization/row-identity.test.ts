import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { integrationFixture } from "./integration-fixture.js";
import { organizationFixture, rawRow, uid } from "./test-fixture.js";
import { confirmLineage } from "./lineage.js";
import { rowWitness } from "./sources.js";

describe("physische Row-Identität über tatsächliche Managerprojektionen", () => {
  it.each([null, undefined, "ungueltige-uid"])("H1a: verlorene UID %j sperrt den früheren Rowzeugen schon im Historypfad", async (missing) => {
    const f = await integrationFixture();
    try {
      const session = f.core.seed("session"); session.messages = [rawRow(1), rawRow(2)];
      const { manager, messages } = f.browser();
      const service = f.pool.organization!; const scope = await service.context();
      await manager.handle("a", f.message({ op: "session.subscribe", sessionId: session.id }));
      const snapshot = messages.find((frame) => frame.type === "result" && frame.op === "session.subscribe");
      if (snapshot?.type !== "result" || snapshot.op !== "session.subscribe") throw new Error("Snapshot fehlt");
      const oldHandle = snapshot.data.snapshot.messages.find((message) => message.rowId === 1)!.readEvidence;
      expect((await f.request("/hermes/v2/organization/read", { sessionId: session.id, evidence: [oldHandle] })).statusCode).toBe(200);
      const old = service.repo.source(scope.id, session.id, "answer", `uid:${uid(1)}`);
      expect(service.repo.acknowledged("a", old.id)).toBe(true);
      const payload = { text: "Antwort 1", persisted_turn: { complete: true, final_assistant_row_id: 1 } };
      f.core.event(session, "message.complete", payload);
      await expect.poll(() => service.repo.facts(scope.id, session.id).length).toBe(1);

      session.messages = [rawRow(1, { message_uid: missing, content: "Neue ungelesene Antwort" }), rawRow(2)];
      await manager.handle("a", { v: 1, id: randomUUID(), op: "history.read", sessionId: session.id, limit: 100, offset: 0 });
      // Kein separater Scan ist erforderlich, um den alten Alias zu sperren.
      expect(rowWitness(service.repo, scope.id, session.id, 1)).toBeNull();
      expect(rowWitness(service.repo, scope.id, session.id, 2)).toBe(uid(2));
      expect(service.repo.coverage(scope.id, session.id)).toMatchObject({ state: "identity-unknown", reason: "ROW_IDENTITY_CHANGED" });
      const seq = session.seq + 1;
      f.core.event(session, "message.complete", { ...payload, text: "Neue ungelesene Antwort" });
      await expect.poll(() => service.repo.facts(scope.id, session.id).length).toBe(2);
      const fresh = service.repo.one<{ id: string }>("SELECT id FROM hermes_v2_sources WHERE scope=? AND source_key=?",
        scope.id, `event:${f.core.epoch}:${session.liveId}:${seq}`)!;
      expect(service.repo.acknowledged("a", fresh.id)).toBe(false);
      expect(service.repo.acknowledged("a", old.id)).toBe(true);
      expect(service.repo.acknowledged("b", old.id)).toBe(false);

      // Die spätere Wiederkehr der alten UID kann die dauerhafte Sperre nicht zurücknehmen.
      const revision = service.repo.coverage(scope.id, session.id).revision;
      session.messages = [rawRow(1), rawRow(2)];
      await manager.handle("a", { v: 1, id: randomUUID(), op: "history.read", sessionId: session.id, limit: 100, offset: 0 });
      expect(rowWitness(service.repo, scope.id, session.id, 1)).toBeNull();
      expect(rowWitness(service.repo, scope.id, session.id, 2)).toBe(uid(2));
      expect(service.repo.coverage(scope.id, session.id).revision).toBe(revision);
    } finally { await f.close(); }
  });

  it("H1b: erster widersprüchlicher Tipzeuge sperrt die physische Row auch für den Root-Liveabschluss", async () => {
    const f = await integrationFixture();
    try {
      const root = f.core.seed("root"); root.messages = [rawRow(1), rawRow(2)];
      const { manager, messages } = f.browser();
      const service = f.pool.organization!; const scope = await service.context();
      await manager.handle("a", f.message({ op: "session.subscribe", sessionId: root.id }));
      const snapshot = messages.find((frame) => frame.type === "result" && frame.op === "session.subscribe");
      if (snapshot?.type !== "result" || snapshot.op !== "session.subscribe") throw new Error("Snapshot fehlt");
      const oldHandle = snapshot.data.snapshot.messages.find((message) => message.rowId === 1)!.readEvidence;
      await f.request("/hermes/v2/organization/read", { sessionId: root.id, evidence: [oldHandle] });
      const old = service.repo.source(scope.id, root.id, "answer", `uid:${uid(1)}`);
      confirmLineage(service.repo, scope.id, { id: "tip", _lineage_root_id: "root", _lineage_ids: ["root", "tip"] }, Date.now());
      const tip = f.core.seed("tip"); tip.messages = [rawRow(1, { message_uid: uid(3), content: "Neue physische Row in Tip" })];
      await manager.handle("a", f.message({ op: "session.subscribe", sessionId: tip.id }));
      expect(rowWitness(service.repo, scope.id, "root", 1)).toBeNull();
      expect(rowWitness(service.repo, scope.id, "tip", 1)).toBeNull();
      expect(rowWitness(service.repo, scope.id, "root", 2)).toBe(uid(2));
      expect(service.repo.coverage(scope.id, "root").state).toBe("identity-unknown");
      expect(service.repo.coverage(scope.id, "tip").state).toBe("identity-unknown");
      const seq = root.seq + 1;
      f.core.event(root, "message.complete", { text: "Neue physische Row in Tip", persisted_turn: { complete: true, final_assistant_row_id: 1 } });
      await expect.poll(() => service.repo.facts(scope.id, "root").length).toBe(1);
      const fresh = service.repo.one<{ id: string }>("SELECT id FROM hermes_v2_sources WHERE scope=? AND source_key=?",
        scope.id, `event:${f.core.epoch}:${root.liveId}:${seq}`)!;
      expect(service.repo.acknowledged("a", fresh.id)).toBe(false);
      expect(service.repo.acknowledged("a", old.id)).toBe(true);
      expect(service.repo.acknowledged("b", old.id)).toBe(false);
      const revisions = ["root", "tip"].map((id) => service.repo.coverage(scope.id, id).revision);
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const id of ["root", "tip"]) {
          await manager.handle("a", { v: 1, id: randomUUID(), op: "history.read", sessionId: id, limit: 100, offset: 0 });
          await service.reconcile.scan(scope, id);
        }
      }
      expect(["root", "tip"].map((id) => service.repo.coverage(scope.id, id).revision)).toEqual(revisions);

      const unrelated = f.core.seed("unrelated"); unrelated.messages = [rawRow(2)];
      await manager.handle("a", f.message({ op: "session.subscribe", sessionId: unrelated.id }));
      const valid = messages.findLast((frame) => frame.type === "result" && frame.op === "session.subscribe");
      if (valid?.type !== "result" || valid.op !== "session.subscribe") throw new Error("Snapshot fehlt");
      expect(valid.data.snapshot.session.id).toBe("unrelated");
      expect(valid.data.snapshot.messages[0]!.readEvidence).toMatch(/^[a-f0-9]{64}$/);
    } finally { await f.close(); }
  });

  it("bekannte Konflikte mit wechselnden UIDs bleiben stabil; eine weitere physische Row weckt neu", async () => {
    const f = await organizationFixture();
    try {
      f.project([rawRow(1), rawRow(2)]);
      f.project([rawRow(1, { message_uid: uid(3) })]);
      const before = f.view();
      f.actions.action("a", f.scope.id, { sessionId: "session", expectedRevision: before.revision, action: "settle" });
      for (const changed of [null, uid(1), uid(3), null]) f.project([rawRow(1, { message_uid: changed })]);
      expect(f.view().coverage.revision).toBe(before.coverage.revision);
      expect(f.view().effectiveSettledAt).not.toBeNull();
      f.project([rawRow(2, { message_uid: uid(4) })]);
      expect(f.view().coverage.revision).toBe(before.coverage.revision + 1);
      expect(f.view().effectiveSettledAt).toBeNull();
      f.repo.close();
      f.project([rawRow(1), rawRow(2)]);
      expect(f.view().coverage.revision).toBe(before.coverage.revision + 1);
      expect(rowWitness(f.repo, f.scope.id, "session", 1)).toBeNull();
      expect(rowWitness(f.repo, f.scope.id, "session", 2)).toBeNull();
    } finally { await f.close(); }
  });

  it("gleiche UID derselben physischen Row in bestätigter anderer Projektion bleibt ein gültiger Beleg", async () => {
    const f = await integrationFixture();
    try {
      const root = f.core.seed("root"); root.messages = [rawRow(1)];
      const { manager, messages } = f.browser();
      const service = f.pool.organization!; const scope = await service.context();
      await manager.handle("a", f.message({ op: "session.subscribe", sessionId: root.id }));
      const snapshot = messages.find((frame) => frame.type === "result" && frame.op === "session.subscribe");
      if (snapshot?.type !== "result" || snapshot.op !== "session.subscribe") throw new Error("Snapshot fehlt");
      await f.request("/hermes/v2/organization/read", { sessionId: root.id, evidence: [snapshot.data.snapshot.messages[0]!.readEvidence] });
      confirmLineage(service.repo, scope.id, { id: "tip", _lineage_root_id: "root", _lineage_ids: ["root", "tip"] }, Date.now());
      const tip = f.core.seed("tip"); tip.messages = [rawRow(1)];
      await manager.handle("a", f.message({ op: "session.subscribe", sessionId: tip.id }));
      expect(rowWitness(service.repo, scope.id, "root", 1)).toBe(uid(1));
      expect(rowWitness(service.repo, scope.id, "tip", 1)).toBe(uid(1));
      f.core.event(tip, "message.complete", { text: "Antwort 1", persisted_turn: { complete: true, final_assistant_row_id: 1 } });
      await expect.poll(() => service.repo.facts(scope.id, "tip").length).toBe(1);
      expect(service.repo.acknowledged("a", service.repo.facts(scope.id, "tip")[0]!.id)).toBe(true);
      expect(service.repo.coverage(scope.id, "root").state).not.toBe("identity-unknown");
      expect(service.repo.coverage(scope.id, "tip").state).not.toBe("identity-unknown");
    } finally { await f.close(); }
  });
});
