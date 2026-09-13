import { globSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { NotificationDatabase } from "./database.js";

interface CursorState {
  opencodeRowId: number;
  codexOffsets: Record<string, number>;
  /** Dauerhaft als T3-intern erkannte OpenCode-Sessions (max. 200). */
  t3Sessions: string[];
  /** Laufende, noch nicht gemeldete Läufe je Haupt-Session. */
  runs: Record<string, RunBuffer>;
}
interface RunBuffer {
  directory: string;
  firstCreated: number;
  lastCompleted: number;
  responses: number;
  usedTool: boolean;
  error: string | null;
  /** Haupt- und Subagenten-Sitzungen, deren Aktivität den Lauf offen hält. */
  sessions: string[];
}
interface OpenCodeEvent { rowId: number; aggregateId: string; data: string }
interface OpenCodeSession { id: string; directory: string; title: string; timeCreated: number; timeUpdated: number; parentId: string | null }
interface T3Directory { directory: string; activeSince: number }

function object(value: unknown): Record<string, unknown> | null { return value && typeof value === "object" ? value as Record<string, unknown> : null; }
function json(value: string): Record<string, unknown> | null { try { return object(JSON.parse(value)); } catch { return null; } }
function nested(value: unknown, key: string): unknown { return object(value)?.[key]; }
function text(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function number(value: unknown): number | null { return typeof value === "number" && Number.isFinite(value) ? value : null; }
function normalized(value: string | null): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}
function sessionMarkerKey(title: string, directory: string | null): string {
  return `${normalized(directory)}\u0000${normalized(title)}`;
}
function projectLabel(directory: string): string { return basename(directory) || directory; }

const T3_DIRECTORY_TOLERANCE_MS = 180_000;
const MAX_TRACKED_T3_SESSIONS = 200;
const MAX_RUN_SESSIONS = 200;
/** Auch kürzlich beendete T3-Turns ordnen ihre OpenCode-Sessions noch zu. */
const T3_RECENT_TURN_MILLISECONDS = 10 * 60_000;

/** Baut den Lauf-Text so, dass auch eine einzelne Antwort natürlich klingt. */
export function runBody(directory: string, responses: number, durationSeconds: number): string {
  const label = responses === 1 ? "1 Antwort" : `${responses} Antworten`;
  return `${projectLabel(directory)} · ${label} · ${durationSeconds} Sekunden`;
}

/**
 * Ordnet eine OpenCode-Session einem T3-Turn zu. T3 benennt seine Threads um
 * und speichert die OpenCode-Session-ID nicht in der Projektion; verlässlich
 * ist deshalb der Startzeitpunkt: Eine Session, die im selben Projektverzeichnis
 * nahe am Start eines aktiven T3-Turns entstand, stammt von T3. Läuft der
 * Turn schon länger, gehören nur noch Subagenten der bekannten Session dazu —
 * neue Roots gelten als manueller Lauf und werden gemeldet.
 */
export function matchesT3Directory(session: Pick<OpenCodeSession, "directory" | "timeCreated">, entry: T3Directory, toleranceMilliseconds = T3_DIRECTORY_TOLERANCE_MS): boolean {
  return session.timeCreated >= entry.activeSince - toleranceMilliseconds && session.timeCreated <= entry.activeSince + toleranceMilliseconds;
}

/** Liest ausschließlich neue Abschlussereignisse aus den lokalen CLI-Verläufen. */
export class AgentSessionSync {
  private timer: NodeJS.Timeout | null = null;
  private state: CursorState = { opencodeRowId: 0, codexOffsets: {}, t3Sessions: [], runs: {} };
  private initialized = false;

  constructor(private readonly options: {
    opencodeDatabasePath: string; t3DatabasePath: string; codexSessionsPath: string; cursorPath: string;
    notifications: NotificationDatabase; pollSeconds: number; completionMinimumSeconds: number; runIdleSeconds: number;
  }) { this.load(); }

  start(): void {
    if (this.timer) return;
    this.poll(this.initialized); this.initialized = true;
    this.timer = setInterval(() => this.poll(true), this.options.pollSeconds * 1_000); this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.save(); }
  private load(): void {
    try {
      const value = JSON.parse(readFileSync(this.options.cursorPath, "utf8")) as Partial<CursorState>;
      this.state = {
        opencodeRowId: typeof value.opencodeRowId === "number" ? value.opencodeRowId : 0,
        codexOffsets: value.codexOffsets ?? {},
        t3Sessions: Array.isArray(value.t3Sessions) ? value.t3Sessions.filter((id): id is string => typeof id === "string").slice(-MAX_TRACKED_T3_SESSIONS) : [],
        runs: object(value.runs) ? value.runs as Record<string, RunBuffer> : {},
      };
      this.initialized = true;
    } catch { /* Der erste Lauf setzt nur eine Baseline. */ }
  }
  private save(): void {
    try {
      mkdirSync(dirname(this.options.cursorPath), { recursive: true });
      this.state.t3Sessions = this.state.t3Sessions.slice(-MAX_TRACKED_T3_SESSIONS);
      writeFileSync(this.options.cursorPath, JSON.stringify(this.state), { mode: 0o600 });
    } catch { /* Best Effort. */ }
  }
  private poll(emit: boolean): void {
    this.pollOpenCode(emit); this.pollCodex(emit); this.finalizeRuns(emit); this.save();
  }

  private pollOpenCode(emit: boolean): void {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.options.opencodeDatabasePath, { readOnly: true }); db.exec("PRAGMA busy_timeout=1000");
      const t3 = this.t3Context();
      const maximum = Number((db.prepare("SELECT COALESCE(MAX(rowid), 0) value FROM event").get() as { value: number }).value);
      if (!emit) { this.state.opencodeRowId = maximum; return; }
      const events = db.prepare(`SELECT rowid rowId, aggregate_id aggregateId, data FROM event
        WHERE rowid > ? AND type = 'message.updated.1' ORDER BY rowid LIMIT 500`).all(this.state.opencodeRowId) as unknown as OpenCodeEvent[];
      // Der Cursor folgt ausschließlich den tatsächlich gelesenen Zeilen. Ein
      // Sprung auf das globale Maximum würde Reste verlieren, sobald pro Poll
      // mehr als 500 Abschlüsse entstehen.
      const sessionCache = new Map<string, OpenCodeSession | null>();
      const t3Cache = new Map<string, boolean>();
      for (const event of events) {
        this.state.opencodeRowId = Math.max(this.state.opencodeRowId, event.rowId);
        const payload = json(event.data); const info = nested(payload, "info"); const time = nested(info, "time");
        if (nested(info, "role") !== "assistant" || number(nested(time, "completed")) === null) continue;
        const session = this.sessionRow(db, event.aggregateId, sessionCache);
        if (!session) continue;
        const root = this.rootSession(db, session, sessionCache);
        if (this.isT3Session(root, t3, t3Cache) || this.isT3Session(session, t3, t3Cache)) continue;
        const messageId = text(nested(info, "id")) ?? String(event.rowId);
        const created = number(nested(time, "created")) ?? session.timeCreated;
        const completed = number(nested(time, "completed"))!;
        const parts = db.prepare("SELECT data FROM part WHERE message_id = ?").all(messageId) as unknown as Array<{ data: string }>;
        const usedTool = parts.some((part) => nested(json(part.data), "type") === "tool");
        const error = text(nested(info, "error"));
        const buffer = this.state.runs[root.id] ?? { directory: root.directory, firstCreated: created, lastCompleted: completed, responses: 0, usedTool: false, error: null, sessions: [] };
        buffer.firstCreated = Math.min(buffer.firstCreated, created);
        buffer.lastCompleted = Math.max(buffer.lastCompleted, completed);
        buffer.responses += 1;
        buffer.usedTool ||= usedTool;
        if (error) buffer.error = error;
        if (!buffer.sessions.includes(root.id)) buffer.sessions.push(root.id);
        if (session.id !== root.id && !buffer.sessions.includes(session.id)) {
          // Bei sehr großem Fan-out bleiben die jüngsten Subagenten im Blick.
          // Die Hauptsitzung wird nie verdrängt.
          if (buffer.sessions.length >= MAX_RUN_SESSIONS) {
            const replaceable = buffer.sessions.findIndex((id) => id !== root.id);
            if (replaceable >= 0) buffer.sessions.splice(replaceable, 1);
          }
          buffer.sessions.push(session.id);
        }
        this.state.runs[root.id] = buffer;
      }
    } catch { /* OpenCode ist optional oder gerade gesperrt. */ } finally { db?.close(); }
  }

  private sessionRow(db: DatabaseSync, id: string, cache: Map<string, OpenCodeSession | null>): OpenCodeSession | null {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const row = db.prepare("SELECT id, directory, title, time_created timeCreated, time_updated timeUpdated, parent_id parentId FROM session WHERE id = ?").get(id) as OpenCodeSession | undefined;
    const value = row ?? null;
    cache.set(id, value);
    return value;
  }

  private rootSession(db: DatabaseSync, session: OpenCodeSession, cache: Map<string, OpenCodeSession | null>): OpenCodeSession {
    let current = session;
    for (let depth = 0; depth < 8 && current.parentId; depth += 1) {
      const parent = this.sessionRow(db, current.parentId, cache);
      if (!parent) break;
      current = parent;
    }
    return current;
  }

  private isT3Session(session: OpenCodeSession, context: { markers: ReadonlySet<string>; directories: ReadonlyMap<string, T3Directory> }, cache: Map<string, boolean>): boolean {
    const cached = cache.get(session.id);
    if (cached !== undefined) return cached;
    const remembered = this.state.t3Sessions.includes(session.id);
    const marker = /^t3 code(?:\s|$)/i.test(session.title.trim()) || context.markers.has(sessionMarkerKey(session.title, session.directory));
    const directory = context.directories.get(normalized(session.directory));
    const matched = remembered || marker || (directory ? matchesT3Directory(session, directory) : false);
    if (matched && !remembered) {
      this.state.t3Sessions.push(session.id);
      this.state.t3Sessions = this.state.t3Sessions.slice(-MAX_TRACKED_T3_SESSIONS);
    }
    cache.set(session.id, matched);
    return matched;
  }

  /** Meldet gepufferte Läufe, sobald die Sitzung die Ruhepause erreicht hat. */
  private finalizeRuns(emit: boolean): void {
    if (!emit) return;
    const now = Date.now();
    const idleMilliseconds = this.options.runIdleSeconds * 1_000;
    const activity = this.sessionActivity();
    for (const [sessionId, buffer] of Object.entries(this.state.runs)) {
      const lastActivity = buffer.sessions.reduce((max, id) => Math.max(max, activity.get(id) ?? 0), buffer.lastCompleted);
      if (now - lastActivity < idleMilliseconds) continue;
      const durationSeconds = Math.max(0, Math.round((buffer.lastCompleted - buffer.firstCreated) / 1_000));
      const failed = buffer.error !== null;
      const directory = buffer.directory;
      const query = new URLSearchParams({ session: sessionId, directory });
      this.options.notifications.create({
        source: "opencode", category: "coding-agent", sourceIcon: "opencode",
        kind: failed ? "agent.failed" : "agent.completed", severity: failed ? "error" : "success",
        title: failed ? "OpenCode fehlgeschlagen" : "OpenCode abgeschlossen",
        body: failed ? buffer.error! : runBody(directory, buffer.responses, durationSeconds),
        link: `/wrapt/opencode?${query.toString()}`, remoteId: `opencode:run:${sessionId}:${buffer.lastCompleted}`,
        meta: { sessionId, directory, durationSeconds, responses: buffer.responses, usedTool: buffer.usedTool },
        report: failed ? { message: buffer.error!, stack: null, context: { Quelle: "OpenCode", Sitzung: sessionId, Arbeitsverzeichnis: directory }, logs: [], environment: {} } : null,
      });
      delete this.state.runs[sessionId];
    }
  }

  /** Aktuelle Aktivitätszeit der gepufferten Sessions, damit ein Lauf erst nach
   *  echter Ruhe gemeldet wird und nicht auf einem alten Pufferwert stehen bleibt. */
  private sessionActivity(): ReadonlyMap<string, number> {
    const ids = [...new Set(Object.values(this.state.runs).flatMap((run) => run.sessions))];
    const values = new Map<string, number>();
    if (ids.length === 0) return values;
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.options.opencodeDatabasePath, { readOnly: true }); db.exec("PRAGMA busy_timeout=1000");
      const placeholders = ids.map(() => "?").join(",");
      const rows = db.prepare(`SELECT id, time_updated timeUpdated FROM session WHERE id IN (${placeholders})`).all(...ids) as unknown as Array<{ id: string; timeUpdated: number }>;
      for (const row of rows) values.set(row.id, row.timeUpdated);
    } catch { /* Ohne Datenbank gilt nur die letzte Antwort als Aktivität. */ } finally { db?.close(); }
    return values;
  }

  private t3Context(): { markers: ReadonlySet<string>; directories: ReadonlyMap<string, T3Directory> } {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.options.t3DatabasePath, { readOnly: true }); db.exec("PRAGMA busy_timeout=1000");
      // Nur Threads mit aktivem oder gerade beendetem Turn liefern ein
      // Zeitfenster. Ein bloß geöffneter T3-Thread (ohne laufenden Turn) darf
      // neue manuelle OpenCode-Läufe im selben Projekt nicht dauerhaft
      // unterdrücken. Kurz zurückliegende Turns schließen die Lücke, wenn der
      // Poll den Abschluss erst nach dem Turn-Ende sieht.
      const recentCutoff = new Date(Date.now() - T3_RECENT_TURN_MILLISECONDS).toISOString();
      const rows = db.prepare(`SELECT t.title title, p.workspace_root directory,
        COALESCE(v.started_at, v.completed_at, t.updated_at) activeSince
        FROM projection_threads t
        LEFT JOIN projection_projects p ON p.project_id = t.project_id
        LEFT JOIN projection_thread_sessions s ON s.thread_id = t.thread_id
        LEFT JOIN projection_turns v ON v.row_id=(SELECT MAX(v2.row_id) FROM projection_turns v2 WHERE v2.thread_id=t.thread_id)
        WHERE t.title IS NOT NULL AND t.title <> ''
          AND (s.status IN ('running','starting')
            OR (v.completed_at IS NOT NULL AND v.completed_at >= ?))`).all(recentCutoff) as unknown as Array<{ title: string; directory: string | null; activeSince: string | null }>;
      const markers = new Set(rows.map((row) => sessionMarkerKey(row.title, row.directory)));
      const directories = new Map<string, T3Directory>();
      for (const row of rows) {
        if (!row.directory) continue;
        const key = normalized(row.directory);
        const activeSince = row.activeSince ? Date.parse(row.activeSince) : 0;
        const entry = directories.get(key);
        if (!entry) directories.set(key, { directory: row.directory, activeSince });
        else entry.activeSince = Math.max(entry.activeSince, activeSince);
      }
      return { markers, directories };
    } catch { return { markers: new Set(), directories: new Map() }; }
    finally { db?.close(); }
  }

  private pollCodex(emit: boolean): void {
    try {
      const files = globSync("**/*.jsonl", { cwd: this.options.codexSessionsPath }).map((path) => join(this.options.codexSessionsPath, path))
        .map((path) => ({ path, stat: statSync(path) })).sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs).slice(0, 200);
      const retained: Record<string, number> = {};
      for (const file of files) {
        const previous = this.state.codexOffsets[file.path];
        if (!emit || previous === undefined || previous >= file.stat.size) { retained[file.path] = file.stat.size; continue; }
        const content = readFileSync(file.path);
        const raw = content.subarray(previous).toString("utf8");
        const lastNewline = raw.lastIndexOf("\n");
        // Nur vollständig geschriebene Zeilen verbrauchen den Offset. Ein
        // halber JSONL-Datensatz wird beim nächsten Poll erneut gelesen.
        const complete = (lastNewline === -1 ? "" : raw.slice(0, lastNewline)).split("\n").filter(Boolean).map(json).filter((line): line is Record<string, unknown> => line !== null);
        retained[file.path] = lastNewline === -1 ? previous : previous + Buffer.byteLength(raw.slice(0, lastNewline + 1), "utf8");
        const meta = json(content.subarray(0, content.indexOf(10)).toString("utf8")); const metaPayload = nested(meta, "payload");
        if (text(nested(metaPayload, "originator"))?.startsWith("t3code")) continue;
        const sessionId = text(nested(metaPayload, "id")) ?? file.path.split("/").at(-1)!.replace(/\.jsonl$/, "");
        const cwd = text(nested(metaPayload, "cwd")) ?? "unbekannt";
        const usedTool = complete.some((line) => line.type === "response_item" && ["function_call", "custom_tool_call"].includes(String(nested(nested(line, "payload"), "type"))));
        for (const line of complete) {
          if (line.type !== "event_msg") continue;
          const payload = nested(line, "payload"); const type = nested(payload, "type");
          if (type !== "task_complete" && type !== "turn_aborted") continue;
          const turnId = text(nested(payload, "turn_id")) ?? text(line.timestamp) ?? String(file.stat.mtimeMs);
          const durationSeconds = Math.max(0, Math.round((number(nested(payload, "duration_ms")) ?? 0) / 1_000)); const failed = type === "turn_aborted";
          if (!failed && !usedTool && durationSeconds < this.options.completionMinimumSeconds) continue;
          const reason = text(nested(payload, "reason"));
          this.options.notifications.create({ source: "codex", category: "coding-agent", sourceIcon: "codex",
            kind: failed ? "agent.failed" : "agent.completed", severity: failed ? "error" : "success",
            title: failed ? "Codex fehlgeschlagen" : "Codex abgeschlossen", body: failed ? reason ?? "Der Lauf wurde abgebrochen." : `${projectLabel(cwd)} nach ${durationSeconds} Sekunden`,
            link: `/wrapt/codex?session=${encodeURIComponent(sessionId)}`, remoteId: `codex:${sessionId}:${turnId}`,
            meta: { sessionId, cwd, durationSeconds, usedTool }, report: failed ? { message: reason ?? "Codex-Lauf abgebrochen", stack: null, context: { Quelle: "Codex", Sitzung: sessionId, Arbeitsverzeichnis: cwd }, logs: [], environment: {} } : null });
        }
      }
      this.state.codexOffsets = retained;
    } catch { /* Codex-Verläufe sind optional. */ }
  }
}
