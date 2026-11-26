import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TerminalKind, TerminalSessionStatus, TerminalWorkspaceV2 } from "@wrapt/contracts";
import {
  TerminalWorkspaceStore,
  type TerminalWorkspaceChangeListener,
} from "./workspaceStore.js";

export type { TerminalWorkspaceChange, TerminalWorkspaceChangeListener } from "./workspaceStore.js";

export interface StoredTerminalSession {
  id: string;
  userId: string;
  runtimeId: string;
  kind: TerminalKind;
  mode: "agent" | "login";
  projectId: string | null;
  profilePath: string | null;
  supervisorName: string | null;
  cwd: string;
  pid: number;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  exitSignal: number | null;
  epoch: number;
}

interface SessionRow {
  id: string;
  userId: string;
  runtimeId: string;
  kind: TerminalKind;
  mode: "agent" | "login";
  projectId: string | null;
  profilePath: string | null;
  supervisorName: string | null;
  cwd: string;
  pid: number;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  createdAt: number;
  updatedAt: number;
  exitCode: number | null;
  exitSignal: number | null;
  epoch: number;
}

/** Pane-Zustand aus Sicht der Persistenz (A-Vertrag, ohne Supervisor-Import). */
export interface ReconciledPaneStatus {
  state: "alive" | "dead" | "missing" | "unknown";
  exitCode: number | null;
  exitSignal?: number | null;
}

function rowToSession(row: SessionRow): StoredTerminalSession { return { ...row }; }

export class TerminalDatabase {
  private readonly db: DatabaseSync;
  private readonly workspaces: TerminalWorkspaceStore;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    // NORMAL statt FULL: Mit WAL ist NORMAL absturzsicher (fsync am Checkpoint statt pro Commit, P-010).
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS terminal_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS terminal_sessions (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        runtime_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        mode TEXT NOT NULL,
        project_id TEXT,
        profile_path TEXT,
        supervisor_name TEXT,
        cwd TEXT NOT NULL,
        pid INTEGER NOT NULL,
        cols INTEGER NOT NULL,
        rows INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        exit_code INTEGER,
        exit_signal INTEGER,
        UNIQUE(owner_id, runtime_id)
      );
      CREATE INDEX IF NOT EXISTS terminal_sessions_owner_updated
        ON terminal_sessions(owner_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS terminal_workspaces (
        owner_id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO terminal_schema_migrations(version, applied_at)
        VALUES (1, datetime('now'));
    `);
    const columns = this.db.prepare("PRAGMA table_info(terminal_sessions)").all() as unknown as Array<{ name: string }>;
    if (!columns.some((column) => column.name === "supervisor_name")) {
      this.db.exec("ALTER TABLE terminal_sessions ADD COLUMN supervisor_name TEXT");
    }
    if (!columns.some((column) => column.name === "epoch")) {
      this.db.exec("ALTER TABLE terminal_sessions ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0");
    }
    this.workspaces = new TerminalWorkspaceStore(this.db);
  }

  close() { this.db.close(); }

  onWorkspaceChange(listener: TerminalWorkspaceChangeListener): () => void {
    return this.workspaces.onWorkspaceChange(listener);
  }

  /** Prüft, ob eine Runtime noch im aktuellen Workspace sichtbar ist. Eine
   *  unlesbare Ablage gilt als referenziert, damit nichts versehentlich fällt. */
  isRuntimeReferenced(userId: string, runtimeId: string): boolean {
    return this.workspaces.isRuntimeReferenced(userId, runtimeId);
  }

  markRunningSessionsInterrupted() {
    this.db.prepare(`UPDATE terminal_sessions SET status = 'interrupted', updated_at = ? WHERE status IN ('starting', 'running')`).run(Date.now());
  }

  reconcileSupervisorSessions(
    activeNames: ReadonlySet<string>,
    panes?: ReadonlyMap<string, ReconciledPaneStatus>,
  ) {
    const rows = this.db.prepare("SELECT id, supervisor_name supervisorName FROM terminal_sessions WHERE status IN ('starting', 'running')").all() as unknown as Array<{ id: string; supervisorName: string | null }>;
    const update = this.db.prepare("UPDATE terminal_sessions SET status = ?, updated_at = ?, exit_code = ?, exit_signal = ? WHERE id = ?");
    const now = Date.now();
    for (const row of rows) {
      const pane = row.supervisorName ? panes?.get(row.supervisorName) : undefined;
      if (pane?.state === "dead") {
        const cleanExit = pane.exitCode === 0 && (pane.exitSignal === null || pane.exitSignal === 0 || pane.exitSignal === undefined);
        update.run(cleanExit ? "exited" : "interrupted", now, pane.exitCode, pane.exitSignal ?? null, row.id);
      } else if (!row.supervisorName || !activeNames.has(row.supervisorName)) {
        update.run("interrupted", now, null, null, row.id);
      }
    }
  }

  /**
   * Entfernt alte Sitzungen, die weder im Workspace sichtbar noch an einen
   * laufenden Supervisor-Prozess gebunden sind. Solche verwaisten Zeilen
   * bleiben sonst unsichtbar in der Registry; die Quote zählt sie zwar nicht
   * mehr, aber ohne Bereinigung wächst der Bestand unbegrenzt.
   */
  purgeStaleSessions(activeSupervisorNames: ReadonlySet<string>, olderThanMs: number): number {
    const owners = this.db.prepare("SELECT DISTINCT owner_id ownerId FROM terminal_sessions WHERE status <> 'closed'").all() as unknown as Array<{ ownerId: string }>;
    const remove = this.db.prepare("DELETE FROM terminal_sessions WHERE owner_id = ? AND id = ?");
    const threshold = Date.now() - olderThanMs;
    let removed = 0;
    for (const { ownerId } of owners) {
      const referencedIds = this.workspaces.referencedRuntimeIds(ownerId);
      // Ein defektes Workspace-Dokument darf keine Sitzungen verwerfen.
      if (referencedIds === null) continue;
      const referenced = new Set(referencedIds);
      const rows = this.db.prepare("SELECT id, runtime_id runtimeId, status, supervisor_name supervisorName FROM terminal_sessions WHERE owner_id = ? AND status <> 'closed' AND updated_at < ?").all(ownerId, threshold) as unknown as Array<{ id: string; runtimeId: string; status: TerminalSessionStatus; supervisorName: string | null }>;
      for (const row of rows) {
        if (row.status === "running" || row.status === "starting") continue;
        if (referenced.has(row.runtimeId)) continue;
        if (row.supervisorName && activeSupervisorNames.has(row.supervisorName)) continue;
        remove.run(ownerId, row.id);
        removed += 1;
      }
    }
    return removed;
  }

  findSession(userId: string, runtimeId: string): StoredTerminalSession | undefined {
    const row = this.db.prepare(`SELECT id, owner_id userId, runtime_id runtimeId, kind, mode,
      project_id projectId, profile_path profilePath, supervisor_name supervisorName, cwd, pid, cols, rows, status,
      created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal, epoch
      FROM terminal_sessions WHERE owner_id = ? AND runtime_id = ?`).get(userId, runtimeId) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  findSessionById(userId: string, sessionId: string): StoredTerminalSession | undefined {
    const row = this.db.prepare(`SELECT id, owner_id userId, runtime_id runtimeId, kind, mode,
      project_id projectId, profile_path profilePath, supervisor_name supervisorName, cwd, pid, cols, rows, status,
      created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal, epoch
      FROM terminal_sessions WHERE owner_id = ? AND id = ?`).get(userId, sessionId) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  findSessionBySupervisor(supervisorName: string): StoredTerminalSession | undefined {
    const row = this.db.prepare(`SELECT id, owner_id userId, runtime_id runtimeId, kind, mode,
      project_id projectId, profile_path profilePath, supervisor_name supervisorName, cwd, pid, cols, rows, status,
      created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal, epoch
      FROM terminal_sessions WHERE supervisor_name = ?`).get(supervisorName) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  listSessions(userId: string, connectedClients: (sessionId: string) => number) {
    const rows = this.db.prepare(`SELECT id, owner_id userId, runtime_id runtimeId, kind, mode,
      project_id projectId, profile_path profilePath, supervisor_name supervisorName, cwd, pid, cols, rows, status,
      created_at createdAt, updated_at updatedAt, exit_code exitCode, exit_signal exitSignal, epoch
      FROM terminal_sessions WHERE owner_id = ? AND status <> 'closed' ORDER BY updated_at DESC`).all(userId) as unknown as SessionRow[];
    return rows.map((row) => ({ ...rowToSession(row), connectedClients: connectedClients(row.id) }));
  }

  saveSession(session: StoredTerminalSession) {
    this.db.prepare(`INSERT INTO terminal_sessions(
      id, owner_id, runtime_id, kind, mode, project_id, profile_path, supervisor_name, cwd, pid, cols, rows,
      status, created_at, updated_at, exit_code, exit_signal, epoch
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      runtime_id=excluded.runtime_id, kind=excluded.kind, mode=excluded.mode,
      project_id=excluded.project_id, profile_path=excluded.profile_path, supervisor_name=excluded.supervisor_name, cwd=excluded.cwd,
      pid=excluded.pid, cols=excluded.cols, rows=excluded.rows, status=excluded.status,
      created_at=excluded.created_at, updated_at=excluded.updated_at,
      exit_code=excluded.exit_code, exit_signal=excluded.exit_signal, epoch=excluded.epoch`).run(
      session.id, session.userId, session.runtimeId, session.kind, session.mode, session.projectId,
      session.profilePath, session.supervisorName, session.cwd, session.pid, session.cols, session.rows, session.status,
      session.createdAt, session.updatedAt, session.exitCode, session.exitSignal, session.epoch,
    );
  }

  updateSession(session: StoredTerminalSession) { this.saveSession(session); }

  /**
   * Reserviert einen Quota-Platz und legt die Session in einer Transaktion an.
   * Die Quote hängt damit nicht mehr an der In-Memory-Map eines Prozesses:
   * Auch nach einem Neustart oder bei parallelen Startanfragen zählt der
   * persistierte Bestand, und der Check ist atomar gegen das Limit.
   *
   * Gezählt werden nur echte Plätze: laufende Sessions, solche mit lebendem
   * Supervisor-Prozess und solche, die im Workspace sichtbar sind.
   * Unterbrochene oder beendete Sitzungen ohne Workspace-Eintrag und ohne
   * lebenden Prozess sind abrufbare Altlasten und dürfen keine neuen
   * Terminalstarts dauerhaft blockieren.
   */
  tryReserveSession(session: StoredTerminalSession, limits: { overall: number; kind: number }, activeSupervisorNames: ReadonlySet<string> = new Set()): "reserved" | "kind-limit" | "overall-limit" {
    // Referenzen vor der Transaktion lesen: getWorkspace() kann ein V1-Dokument
    // migrieren und würde innerhalb der laufenden Transaktion rekursiv schreiben.
    // json_each statt einer variablen IN-Liste hält die Abfragen auch bei sehr
    // vielen Einträgen unter dem Parameterlimit von SQLite.
    const activeFilter = `AND (status IN ('starting', 'running')
      OR runtime_id IN (SELECT value FROM json_each(?))
      OR supervisor_name IN (SELECT value FROM json_each(?)))`;
    const referencedJson = JSON.stringify(this.workspaces.referencedRuntimeIds(session.userId) ?? []);
    const supervisorJson = JSON.stringify([...activeSupervisorNames]);
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const overall = (this.db.prepare(`SELECT COUNT(*) count FROM terminal_sessions WHERE owner_id = ? AND status <> 'closed' ${activeFilter}`).get(session.userId, referencedJson, supervisorJson) as { count: number }).count;
      if (overall >= limits.overall) return "overall-limit";
      const ofKind = (this.db.prepare(`SELECT COUNT(*) count FROM terminal_sessions WHERE owner_id = ? AND status <> 'closed' AND kind = ? ${activeFilter}`).get(session.userId, session.kind, referencedJson, supervisorJson) as { count: number }).count;
      if (ofKind >= limits.kind) return "kind-limit";
      this.saveSession(session);
      this.db.exec("COMMIT");
      committed = true;
      return "reserved";
    } finally {
      if (!committed && this.db.isTransaction) this.db.exec("ROLLBACK");
    }
  }

  deleteSession(userId: string, sessionId: string) {
    this.db.prepare("DELETE FROM terminal_sessions WHERE owner_id = ? AND id = ?").run(userId, sessionId);
  }

  persistentSessions(userId: string): StoredTerminalSession[] {
    const runtimeIds = new Set(this.workspaces.getWorkspace(userId).document.entries
      .filter((entry) => entry.persistent)
      .flatMap((entry) => entry.runtimeId ? [entry.runtimeId] : []));
    return [...runtimeIds].flatMap((runtimeId) => {
      const session = this.findSession(userId, runtimeId);
      return session?.status === "interrupted" && session.mode === "agent" ? [session] : [];
    });
  }

  getWorkspace(userId: string) {
    return this.workspaces.getWorkspace(userId);
  }

  /** Setzt ein beschädigtes oder unerwünschtes Layout bewusst zurück. */
  resetWorkspace(userId: string) {
    return this.workspaces.resetWorkspace(userId);
  }

  saveWorkspace(userId: string, document: TerminalWorkspaceV2, expectedRevision: number | null) {
    return this.workspaces.saveWorkspace(userId, document, expectedRevision);
  }
}
