import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { isMainThread, parentPort, workerData } from "node:worker_threads";

/**
 * @typedef {{id: string, at: string, requestId: string, actor: string, action: string,
 * target: string, statusCode: number, previousHash: string|null, entryHash: string, sequence: number}} AuditRow
 */

/** Volle Kette innerhalb eines konsistenten SQLite-Snapshots prüfen.
 * @param {DatabaseSync} database
 */
export function verifyAuditDatabase(database) {
  database.exec("BEGIN");
  try {
    const rows = database.prepare(`SELECT sequence,id,at,request_id requestId,actor,action,target,
      status_code statusCode,previous_hash previousHash,entry_hash entryHash
      FROM operational_audit ORDER BY sequence`).iterate();
    let valid = true;
    let previous = null;
    let entries = 0;
    let latestAt = null;
    let checkedSequence = 0;
    for (const raw of rows) {
      const row = /** @type {AuditRow} */ (/** @type {unknown} */ (raw));
      const canonical = JSON.stringify({ id: row.id, at: row.at, requestId: row.requestId,
        actor: row.actor, action: row.action, target: row.target, statusCode: row.statusCode, previousHash: row.previousHash });
      if (createHash("sha256").update(canonical).digest("hex") !== row.entryHash) valid = false;
      if (entries > 0 && row.previousHash !== previous) valid = false;
      previous = row.entryHash;
      entries += 1;
      latestAt = row.at;
      checkedSequence = row.sequence;
    }
    database.exec("COMMIT");
    return { valid, entries, latestAt, checkedSequence };
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}

if (!isMainThread) {
  const database = new DatabaseSync(workerData.path, { readOnly: true });
  database.exec("PRAGMA busy_timeout=5000");
  parentPort?.on("message", () => {
    try { parentPort?.postMessage({ result: verifyAuditDatabase(database) }); }
    catch (error) { parentPort?.postMessage({ error: error instanceof Error ? error.message : "Auditprüfung fehlgeschlagen" }); }
  });
}
