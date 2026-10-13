import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it, vi } from "vitest";
import { OperationalAuditDatabase } from "./audit.js";

const directories: string[] = [];
afterEach(async () => { vi.useRealTimers(); await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });
async function fixture(count = 10_000, ttl = 5_000) {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-audit-worker-"));
  directories.push(directory);
  const path = join(directory, "audit.sqlite");
  const audit = new OperationalAuditDatabase(path, ttl);
  const db = new DatabaseSync(path);
  const insert = db.prepare(`INSERT INTO operational_audit(id,at,request_id,actor,action,target,status_code,previous_hash,entry_hash)
    VALUES(?,?,?,?,?,?,?,?,?)`);
  db.exec("BEGIN");
  let previousHash: string | null = null;
  for (let index = 0; index < count; index += 1) {
    const row: { id: string; at: string; requestId: string; actor: string; action: string; target: string; statusCode: number; previousHash: string | null } = {
      id: String(index), at: "2026-01-01T00:00:00Z", requestId: String(index), actor: "dummy", action: "test", target: "fixture", statusCode: 200, previousHash,
    };
    const hash: string = createHash("sha256").update(JSON.stringify(row)).digest("hex");
    insert.run(row.id, row.at, row.requestId, row.actor, row.action, row.target, row.statusCode, previousHash, hash);
    previousHash = hash;
  }
  db.exec("COMMIT");
  return { path, audit, db };
}

it("prüft 10k vollständig ohne den Mainthread zu blockieren und dedupliziert zehn Leser", async () => {
  const { audit, db } = await fixture();
  try {
    const timer = vi.fn();
    setTimeout(timer, 1);
    const reads = Array.from({ length: 10 }, () => audit.verifyAsync());
    const results = await Promise.all(reads);
    expect(timer).toHaveBeenCalledOnce();
    expect(results[0]).toEqual({ valid: true, entries: 10_000, latestAt: "2026-01-01T00:00:00Z", checkedSequence: 10_000 });
    expect(results.every((result) => result === results[0])).toBe(true);
    expect(audit.verify()).toEqual({ valid: true, entries: results[0]!.entries, latestAt: results[0]!.latestAt });
  } finally { db.close(); await audit.close(); }
});

it("prüft alte Manipulationen nach TTL auch bei gleicher Sequenz und invalidiert bei Mutationen", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-12T12:00:00Z"));
  const { audit, db } = await fixture(3_701, 20);
  try {
    const first = await audit.verifyAsync();
    db.exec("UPDATE operational_audit SET target='manipuliert' WHERE sequence=1");
    expect(await audit.verifyAsync()).toBe(first);
    vi.setSystemTime(Date.now() + 25);
    expect(await audit.verifyAsync()).toMatchObject({ valid: false, checkedSequence: 3_701 });
    audit.record({ requestId: "neu", actor: "dummy", action: "test", target: "neu", statusCode: 200 });
    expect(await audit.verifyAsync()).toMatchObject({ valid: false, entries: 3_702, checkedSequence: 3_702 });
  } finally { db.close(); await audit.close(); }
});

it("bindet parallele Mutationen an den geprüften Highwater und cached keinen alten Snapshot neu", async () => {
  const { audit, db } = await fixture();
  try {
    const first = audit.verifyAsync();
    audit.record({ requestId: "parallel", actor: "dummy", action: "test", target: "parallel", statusCode: 200 });
    const second = audit.verifyAsync();
    const results = await Promise.all([first, second]);
    expect(results[0]).toBe(results[1]);
    const fresh = await audit.verifyAsync();
    expect(fresh).toMatchObject({ valid: true, entries: 10_000, checkedSequence: 10_001 });
    expect(fresh).not.toBe(results[0]);
  } finally { db.close(); await audit.close(); }
});

it("meldet Workerfehler und beendet einen laufenden Read beim Shutdown", async () => {
  const { audit, db } = await fixture();
  db.exec("DROP TABLE operational_audit");
  await expect(audit.verifyAsync()).rejects.toThrow("operational_audit");
  db.close();
  await audit.close();
  const other = await fixture();
  const pending = other.audit.verifyAsync();
  const rejected = expect(pending).rejects.toThrow("Shutdown");
  await other.audit.close();
  await rejected;
  other.db.close();
});
