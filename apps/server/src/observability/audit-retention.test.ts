import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { OperationalAuditDatabase } from "./audit.js";

it.each([0, 9_998, 9_999, 10_000, 10_001])("behält genau die neuesten Reihen bei %i Vorgängern mit Sequenzlücken", (count) => {
  const root = mkdtempSync(join(tmpdir(), "audit-retention-"));
  const path = join(root, "fixture.sqlite");
  const audit = new OperationalAuditDatabase(path);
  const db = new DatabaseSync(path);
  try {
    db.exec(`WITH RECURSIVE seed(n) AS (SELECT 1 WHERE ${count} > 0 UNION ALL SELECT n+1 FROM seed WHERE n < ${count})
      INSERT INTO operational_audit(sequence,id,at,request_id,actor,action,target,status_code,previous_hash,entry_hash)
      SELECT n*3, 'id-'||n, '2026-10-12', 'request', 'actor', 'PUT', 'target', 200, 'hash-'||(n-1), 'hash-'||n FROM seed`);
    const expected = db.prepare("SELECT sequence, entry_hash, previous_hash FROM operational_audit ORDER BY sequence DESC LIMIT 9999").all().reverse();
    audit.record({ requestId: "new", actor: "test", action: "PUT", target: "/fixture", statusCode: 200 });
    const rows = db.prepare("SELECT sequence, entry_hash, previous_hash FROM operational_audit ORDER BY sequence").all();
    expect(rows).toHaveLength(Math.min(count + 1, 10_000));
    expect(rows.slice(0, -1)).toEqual(expected);
    expect(rows.at(-1)?.previous_hash).toBe(count ? `hash-${count}` : null);
  } finally {
    db.close();
    audit.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("rollt auch den neuen Eintrag zurück, wenn die Retention scheitert", () => {
  const root = mkdtempSync(join(tmpdir(), "audit-retention-rollback-"));
  const path = join(root, "fixture.sqlite");
  const audit = new OperationalAuditDatabase(path);
  const db = new DatabaseSync(path);
  try {
    db.exec(`WITH RECURSIVE seed(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seed WHERE n < 10000)
      INSERT INTO operational_audit(id,at,request_id,actor,action,target,status_code,entry_hash)
      SELECT 'id-'||n,'2026-10-12','request','actor','PUT','target',200,'hash-'||n FROM seed;
      CREATE TRIGGER failed_prune BEFORE DELETE ON operational_audit BEGIN SELECT RAISE(ABORT, 'fixture'); END;`);
    expect(() => audit.record({ requestId: "rollback", actor: "test", action: "PUT", target: "/fixture", statusCode: 200 })).toThrow("fixture");
    expect(db.prepare("SELECT COUNT(*) count FROM operational_audit").get()?.count).toBe(10_000);
    expect(db.prepare("SELECT COUNT(*) count FROM operational_audit WHERE request_id='rollback'").get()?.count).toBe(0);
  } finally {
    db.close();
    audit.close();
    rmSync(root, { recursive: true, force: true });
  }
});
