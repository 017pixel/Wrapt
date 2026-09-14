import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface OperationalAuditEvent {
  requestId: string;
  actor: string;
  action: string;
  target: string;
  statusCode: number;
  at?: string;
}

interface AuditRow {
  requestId: string;
  actorHash: string;
  action: string;
  target: string;
  statusCode: number;
  at: string;
}

/**
 * Append-only Auditspur für kritische Workbench-Mutationen. Die Hashkette
 * macht nachträgliche Änderungen sichtbar; Request-Bodies und Secrets werden
 * bewusst nie übernommen. Schlägt der Datenbankschreibvorgang fehl, landet das
 * Ereignis in einer Outbox-Datei und wird beim nächsten Start nachgetragen —
 * dadurch geht kein privilegierter Vorgang still verloren.
 */
export class OperationalAuditDatabase {
  private readonly database: DatabaseSync;
  private readonly outboxPath: string;
  private verifiedAt = 0;
  private verifiedValue: { valid: boolean; entries: number; latestAt: string | null } | null = null;

  constructor(path: string, private readonly verifyCacheMilliseconds = 5_000) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.outboxPath = `${path}.audit-outbox.jsonl`;
    this.database.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
    this.database.exec(`CREATE TABLE IF NOT EXISTS operational_audit (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      at TEXT NOT NULL,
      request_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      previous_hash TEXT,
      entry_hash TEXT NOT NULL UNIQUE
    ) STRICT;
    CREATE INDEX IF NOT EXISTS operational_audit_at ON operational_audit(at);
    CREATE INDEX IF NOT EXISTS operational_audit_request ON operational_audit(request_id);`);
    this.flushOutbox();
  }

  private hashActor(actor: string): string {
    return createHash("sha256").update(`workbench-audit-actor:${actor}`).digest("hex");
  }

  private insertRow(row: AuditRow) {
    const id = randomUUID();
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.database.prepare("SELECT entry_hash entryHash FROM operational_audit ORDER BY sequence DESC LIMIT 1")
        .get() as { entryHash: string } | undefined;
      const canonical = JSON.stringify({
        id,
        at: row.at,
        requestId: row.requestId,
        actor: row.actorHash,
        action: row.action,
        target: row.target,
        statusCode: row.statusCode,
        previousHash: previous?.entryHash ?? null,
      });
      const entryHash = createHash("sha256").update(canonical).digest("hex");
      this.database.prepare(`INSERT INTO operational_audit(
        id,at,request_id,actor,action,target,status_code,previous_hash,entry_hash
      ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
        id,
        row.at,
        row.requestId,
        row.actorHash,
        row.action,
        row.target,
        row.statusCode,
        previous?.entryHash ?? null,
        entryHash,
      );
      // Lokale Einzelbenutzer-Installation: 10.000 kritische Mutationen sind
      // ausreichend Historie, ohne die gemeinsame SQLite unbegrenzt wachsen zu lassen.
      this.database.exec(`DELETE FROM operational_audit WHERE sequence NOT IN (
        SELECT sequence FROM operational_audit ORDER BY sequence DESC LIMIT 10000
      )`);
      this.database.exec("COMMIT");
      this.verifiedValue = null;
      this.verifiedAt = 0;
    } catch (error) {
      if (this.database.isTransaction) this.database.exec("ROLLBACK");
      throw error;
    }
  }

  record(event: OperationalAuditEvent) {
    this.insertRow({
      requestId: event.requestId,
      actorHash: this.hashActor(event.actor),
      action: event.action,
      target: event.target,
      statusCode: event.statusCode,
      at: event.at ?? new Date().toISOString(),
    });
  }

  /**
   * Audit mit Outbox-Fallback: Ist der Auditstore nicht schreibbar, wird das
   * pseudonymisierte Ereignis durabel zwischengespeichert und beim nächsten
   * Start übernommen. Der Aufrufer sieht, ob der Store selbst geschrieben hat.
   */
  recordDurable(event: OperationalAuditEvent): "recorded" | "outbox" {
    try {
      this.record(event);
      return "recorded";
    } catch {
      appendFileSync(this.outboxPath, `${JSON.stringify({
        requestId: event.requestId,
        actorHash: this.hashActor(event.actor),
        action: event.action,
        target: event.target,
        statusCode: event.statusCode,
        at: event.at ?? new Date().toISOString(),
      })}\n`, { mode: 0o600 });
      return "outbox";
    }
  }

  /** Anzahl der noch nicht in die Datenbank übernommenen Outbox-Ereignisse. */
  outboxPending(): number {
    if (!existsSync(this.outboxPath)) return 0;
    return readFileSync(this.outboxPath, "utf8").split("\n").filter((line) => line.trim() !== "").length;
  }

  private flushOutbox() {
    if (!existsSync(this.outboxPath)) return;
    const lines = readFileSync(this.outboxPath, "utf8").split("\n").filter((line) => line.trim() !== "");
    if (lines.length === 0) {
      rmSync(this.outboxPath, { force: true });
      return;
    }
    const remaining: string[] = [];
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as AuditRow;
        this.insertRow(row);
      } catch {
        remaining.push(line);
      }
    }
    if (remaining.length === 0) rmSync(this.outboxPath, { force: true });
    else writeFileSync(this.outboxPath, `${remaining.join("\n")}\n`, { mode: 0o600 });
  }

  verify(): { valid: boolean; entries: number; latestAt: string | null } {
    if (this.verifiedValue && Date.now() - this.verifiedAt < this.verifyCacheMilliseconds) return this.verifiedValue;
    const rows = this.database.prepare(`SELECT id,at,request_id requestId,actor,action,target,status_code statusCode,
      previous_hash previousHash,entry_hash entryHash FROM operational_audit ORDER BY sequence`).all() as Array<{
      id: string; at: string; requestId: string; actor: string; action: string; target: string;
      statusCode: number; previousHash: string | null; entryHash: string;
    }>;
    let valid = true;
    let previousRetainedHash: string | null = null;
    rows.forEach((row, index) => {
      const canonical = JSON.stringify({
        id: row.id,
        at: row.at,
        requestId: row.requestId,
        actor: row.actor,
        action: row.action,
        target: row.target,
        statusCode: row.statusCode,
        previousHash: row.previousHash,
      });
      if (createHash("sha256").update(canonical).digest("hex") !== row.entryHash) valid = false;
      // Der erste aufbewahrte Datensatz darf auf einen bereits durch Retention
      // entfernten Vorgänger zeigen; ab dem zweiten muss die Kette lückenlos sein.
      if (index > 0 && row.previousHash !== previousRetainedHash) valid = false;
      previousRetainedHash = row.entryHash;
    });
    const result = { valid, entries: rows.length, latestAt: rows.at(-1)?.at ?? null };
    this.verifiedValue = result;
    this.verifiedAt = Date.now();
    return result;
  }

  close() { this.database.close(); }
}

const MUTATING_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);

// Bewusste Ausnahmen: hochfrequente, nicht sicherheitsrelevante Statusupdates.
// Alles andere unter /api/v1/ wird auditiert — neue Routen können so nicht
// versehentlich aus der Spur fallen.
const UNAUDITED_MUTATION_PATHS = new Set(["/api/v1/notifications/presence"]);

export function isAuditedMutation(method: string, url: string): boolean {
  if (!MUTATING_METHODS.has(method)) return false;
  const path = url.split("?", 1)[0] ?? url;
  if (!path.startsWith("/api/v1/")) return false;
  return !UNAUDITED_MUTATION_PATHS.has(path);
}
