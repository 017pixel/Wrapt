import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { redactText } from "../hermes/redaction.js";
import type { NotificationDatabase } from "./database.js";
import { REMOTE_READER_SCRIPT } from "./t3-remote-reader.js";

const execFileAsync = promisify(execFile);

export interface ThreadRow {
  threadId: string; title: string; projectId: string; projectTitle: string | null; updatedAt: string;
  pendingApprovalCount: number; pendingUserInputCount: number; hasActionableProposedPlan: number;
  settledAt: string | null; sessionStatus: string | null; lastError: string | null;
  turnId: string | null; turnState: string | null; startedAt: string | null; completedAt: string | null;
  toolCount: number;
}

export interface RemoteT3Source {
  /** SSH-Host, über den die entfernte T3-Instanz erreichbar ist. */
  host: string;
  /** Remote-Pfad zur state.sqlite der T3-Instanz. */
  databasePath: string;
  /** Remote-Pfad zur environment-id der T3-Instanz. */
  environmentIdPath: string;
  /** Optionaler Anzeigename; ohne Angabe wird der Host verwendet. */
  label?: string | undefined;
}

/** Ein finaler Turn, der auf sein Stabilitätsfenster wartet. Der Schnappschuss
 *  hält den letzten gesehenen Stand fest, damit auch ein Turnwechsel oder ein
 *  Dienstneustart die fertige Meldung nicht verliert. */
export interface PendingFinal {
  sourceKey: string; environmentId: string; threadId: string; turnId: string; state: string; firstSeenAt: number;
  snapshot: ThreadRow;
}

interface RemoteSnapshot {
  environmentId: string;
  currentSequence: number;
  touched: string[];
  rows: ThreadRow[];
  activities: Record<string, string[]>;
}

/** Läuft ein Fehlerzustand in einen Abschluss, ist nur das Endergebnis korrekt.
 *  Ein Turn bleibt so lange gepuffert und wird erst nach dem Stabilitätsfenster
 *  gemeldet; ändert sich der Zustand vorher, wird der Puffer korrigiert. */
export function shouldEmitFinal(pending: PendingFinal, row: Pick<ThreadRow, "turnId" | "turnState">, now: number, settleMilliseconds: number): "emit" | "update" | "drop" | "wait" {
  if (row.turnId !== pending.turnId) {
    // Ein neuer Turn verdrängt nur unbestätigte Fehler (Retry). Ein bereits
    // abgeschlossener Turn bleibt ein Ereignis und geht nicht verloren.
    return pending.state === "completed" ? "emit" : "drop";
  }
  if (row.turnState !== pending.state) return "update";
  return now - pending.firstSeenAt >= settleMilliseconds ? "emit" : "wait";
}

/**
 * Behält die zuletzt gesehenen Zeilen einer Remote-Quelle. Der Reader liefert
 * nur berührte Threads; ohne diesen Speicher wäre eine gepufferte Zeile beim
 * nächsten Poll bereits verschwunden und das Stabilitätsfenster könnte nie
 * melden. Neue Zeilen überschreiben den vorherigen Stand, alte fallen nach
 * dem Limit zuerst heraus.
 */
export function mergeRemoteSnapshot(previous: ReadonlyMap<string, ThreadRow> | undefined, rows: readonly ThreadRow[], limit = 500): Map<string, ThreadRow> {
  const merged = new Map(previous ?? []);
  for (const row of rows) merged.set(row.threadId, row);
  while (merged.size > limit) {
    const oldest = merged.keys().next().value;
    if (oldest === undefined) break;
    merged.delete(oldest);
  }
  return merged;
}

function durationSeconds(row: ThreadRow): number {
  if (!row.startedAt) return 0;
  return Math.max(0, (Date.parse(row.completedAt ?? row.settledAt ?? row.updatedAt) - Date.parse(row.startedAt)) / 1_000);
}

const threadSelection = `t.thread_id threadId, t.title, t.project_id projectId, p.title projectTitle, t.updated_at updatedAt,
  t.pending_approval_count pendingApprovalCount, t.pending_user_input_count pendingUserInputCount,
  t.has_actionable_proposed_plan hasActionableProposedPlan, t.settled_at settledAt,
  s.status sessionStatus, s.last_error lastError, v.turn_id turnId, v.state turnState,
  v.started_at startedAt, v.completed_at completedAt,
  (SELECT COUNT(*) FROM projection_thread_activities a WHERE a.thread_id=t.thread_id AND a.kind LIKE 'tool.%' AND (a.turn_id=v.turn_id OR v.turn_id IS NULL)) toolCount
  FROM projection_threads t
  LEFT JOIN projection_projects p ON p.project_id = t.project_id
  LEFT JOIN projection_thread_sessions s ON s.thread_id=t.thread_id
  LEFT JOIN projection_turns v ON v.row_id=(SELECT MAX(v2.row_id) FROM projection_turns v2 WHERE v2.thread_id=t.thread_id)
  WHERE t.deleted_at IS NULL`;


export class T3StatusSync {
  private timer: NodeJS.Timeout | null = null;
  private initialized = false;
  private lastSequence = 0;
  private readonly remoteStates: Map<string, { lastSequence: number; initialized: boolean }> = new Map();
  private readonly pendingFinals: Map<string, PendingFinal> = new Map();
  private readonly remoteSnapshots: Map<string, Map<string, ThreadRow>> = new Map();
  private readonly remoteActivities: Map<string, Map<string, string[]>> = new Map();

  constructor(private readonly options: {
    databasePath: string; environmentIdPath: string; notifications: NotificationDatabase;
    pollSeconds: number; completionMinimumSeconds: number; miniTaskSeconds: number; cursorPath: string;
    finalSettleSeconds?: number;
    remoteSources?: RemoteT3Source[];
  }) {
    try {
      const cursor = JSON.parse(readFileSync(options.cursorPath, "utf8")) as { lastSequence?: unknown; pendingFinals?: unknown };
      if (typeof cursor.lastSequence === "number" && Number.isSafeInteger(cursor.lastSequence)) { this.lastSequence = cursor.lastSequence; this.initialized = true; }
      this.restorePendingFinals(cursor.pendingFinals);
    } catch { /* Beim ersten Start existiert noch kein Cursor. */ }
    for (const source of options.remoteSources ?? []) {
      const state = { lastSequence: 0, initialized: false };
      try {
        const cursor = JSON.parse(readFileSync(this.remoteCursorPath(source), "utf8")) as { lastSequence?: unknown; pendingFinals?: unknown };
        if (typeof cursor.lastSequence === "number" && Number.isSafeInteger(cursor.lastSequence)) { state.lastSequence = cursor.lastSequence; state.initialized = true; }
        this.restorePendingFinals(cursor.pendingFinals);
      } catch { /* Noch kein Remote-Cursor vorhanden. */ }
      this.remoteStates.set(source.host, state);
    }
  }

  private restorePendingFinals(value: unknown): void {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const pending = entry as Partial<PendingFinal>;
      if (typeof pending.sourceKey !== "string" || typeof pending.threadId !== "string" || typeof pending.turnId !== "string" || typeof pending.state !== "string" || typeof pending.firstSeenAt !== "number") continue;
      const snapshot = pending.snapshot;
      if (!snapshot || typeof snapshot !== "object" || typeof snapshot.threadId !== "string" || typeof snapshot.turnId !== "string"
        || typeof snapshot.title !== "string" || typeof snapshot.projectId !== "string" || typeof snapshot.updatedAt !== "string"
        || typeof snapshot.turnState !== "string" || typeof snapshot.toolCount !== "number") continue;
      this.pendingFinals.set(`${pending.sourceKey}:${pending.threadId}`, pending as PendingFinal);
    }
  }

  start(): void { if (this.timer) return; this.timer = setInterval(() => void this.poll(), this.options.pollSeconds * 1_000); this.timer.unref(); void this.poll(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.saveCursor(); for (const source of this.options.remoteSources ?? []) this.saveRemoteCursor(source); }

  private remoteCursorPath(source: RemoteT3Source): string {
    return `${this.options.cursorPath}.remote-${source.host}`;
  }

  async poll(): Promise<void> {
    this.pollLocal();
    await this.pollRemote();
    this.settleFinals();
  }

  private pollLocal(): void {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(this.options.databasePath, { readOnly: true });
      db.exec("PRAGMA busy_timeout=1500");
      // Spalten werden absichtlich über Runtime-Prüfung gelesen. T3 Nightly darf sein Schema migrieren.
      const columns = new Set((db.prepare("PRAGMA table_info(projection_threads)").all() as unknown as Array<{ name: string }>).map((item) => item.name));
      if (!["thread_id", "title", "pending_approval_count", "pending_user_input_count", "has_actionable_proposed_plan"].every((name) => columns.has(name))) return;
      const currentSequence = Number((db.prepare("SELECT COALESCE(MAX(sequence),0) sequence FROM orchestration_events").get() as { sequence: number }).sequence);
      // Die T3-Datenbank wurde neu angelegt oder ein Kanalwechsel hat sie
      // migriert: Der alte Cursor zeigt ins Leere. Dieser Durchlauf setzt nur
      // eine neue Baseline und meldet keine alten Abschlüsse erneut.
      let allowCompletion = this.initialized;
      if (currentSequence < this.lastSequence) { this.lastSequence = 0; allowCompletion = false; }
      const touched = this.initialized
        ? (db.prepare("SELECT DISTINCT stream_id threadId FROM orchestration_events WHERE sequence > ? AND aggregate_kind = 'thread'").all(this.lastSequence) as unknown as Array<{ threadId: string }>).map((item) => item.threadId)
        : [];
      const filter = this.initialized ? (touched.length ? `AND t.thread_id IN (${touched.map(() => "?").join(",")})` : "AND 0") : "";
      const rows = db.prepare(`SELECT ${threadSelection} ${filter}`).all(...touched) as unknown as ThreadRow[];
      const environmentId = this.environmentId();
      for (const row of rows) this.process(row, environmentId, allowCompletion, "local");
      this.initialized = true;
      this.lastSequence = currentSequence;
      this.saveCursor();
    } catch {
      // T3 kann während eines Kanalwechsels migrieren oder seine DB kurz sperren. Der nächste Poll versucht es erneut.
    } finally { db?.close(); }
  }

  private async pollRemote(): Promise<void> {
    for (const source of this.options.remoteSources ?? []) {
      try {
        const state = this.remoteStates.get(source.host);
        if (!state) continue;
        // Das Skript Base64-encodiert über die Remote-Shell ausführen: Die
        // Remote-Shell bekommt nur einen einzigen einfachen Befehl, Argumente
        // und Skript enthalten keine Sonderzeichen mehr, die sie umdeuten könnte.
        const encoded = Buffer.from(REMOTE_READER_SCRIPT, "utf8").toString("base64");
        const command = `echo ${encoded} | base64 -d | python3 - '${source.databasePath.replaceAll("'", "'\\''")}' '${source.environmentIdPath.replaceAll("'", "'\\''")}' ${state.lastSequence} ${state.initialized ? 1 : 0}`;
        const { stdout } = await execFileAsync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", source.host, command], { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 });
        const snapshot = JSON.parse(stdout) as RemoteSnapshot;
        const environmentId = snapshot.environmentId;
        const currentSequence = snapshot.currentSequence;
        // Gleicher Baseline-Schutz wie lokal: Nach einem Sprung zurück meldet
        // dieser Durchlauf keine alten Abschlüsse erneut.
        let allowCompletion = state.initialized;
        if (currentSequence < state.lastSequence) { state.lastSequence = 0; allowCompletion = false; }
        const byThread = mergeRemoteSnapshot(this.remoteSnapshots.get(source.host), snapshot.rows);
        const activities = new Map(this.remoteActivities.get(source.host) ?? []);
        for (const row of snapshot.rows) {
          activities.set(row.threadId, snapshot.activities[row.threadId] ?? []);
          this.process(row, environmentId, allowCompletion, source.host);
        }
        // Die Aktivitäten wachsen mit demselben Limit wie die Zeilen selbst.
        for (const threadId of [...activities.keys()]) if (!byThread.has(threadId)) activities.delete(threadId);
        this.remoteSnapshots.set(source.host, byThread);
        this.remoteActivities.set(source.host, activities);
        state.initialized = true;
        state.lastSequence = currentSequence;
        this.saveRemoteCursor(source);
      } catch {
        // Remote nicht erreichbar oder Schema-Migration: Der nächste Poll versucht es erneut.
      }
    }
  }

  /** Meldet gepufferte finale Turns, sobald ihr Zustand stabil geblieben ist. */
  private settleFinals(): void {
    const now = Date.now();
    const settleMilliseconds = (this.options.finalSettleSeconds ?? 10) * 1_000;
    const localKeys = [...this.pendingFinals.entries()].filter(([, pending]) => pending.sourceKey === "local").map(([key]) => key);
    if (localKeys.length > 0) {
      let db: DatabaseSync | null = null;
      try {
        db = new DatabaseSync(this.options.databasePath, { readOnly: true });
        db.exec("PRAGMA busy_timeout=1500");
        const rows = db.prepare(`SELECT ${threadSelection} AND t.thread_id IN (${localKeys.map(() => "?").join(",")})`)
          .all(...localKeys.map((key) => this.pendingFinals.get(key)!.threadId)) as unknown as ThreadRow[];
        const byThread = new Map(rows.map((row) => [row.threadId, row]));
        for (const key of localKeys) {
          const pending = this.pendingFinals.get(key);
          if (!pending) continue;
          const row = byThread.get(pending.threadId);
          if (!row) { this.pendingFinals.delete(key); continue; }
          const outcome = shouldEmitFinal(pending, row, now, settleMilliseconds);
          if (outcome === "drop") { this.pendingFinals.delete(key); continue; }
          if (outcome === "update") { pending.state = row.turnState ?? pending.state; pending.turnId = row.turnId ?? pending.turnId; pending.snapshot = row; pending.firstSeenAt = now; continue; }
          if (outcome === "wait") continue;
          // Beim Turnwechsel zählt der festgehaltene Stand des fertigen Turns.
          const target = row.turnId === pending.turnId ? row : pending.snapshot;
          const logs = (db.prepare("SELECT summary FROM projection_thread_activities WHERE thread_id=? ORDER BY created_at DESC LIMIT 20").all(pending.threadId) as unknown as Array<{ summary: string }>).map((item) => redactText(item.summary, 1_000)).reverse();
          this.emitFinal(target, pending.environmentId, logs);
          this.pendingFinals.delete(key);
        }
      } catch { /* Der nächste Poll versucht es erneut. */ } finally { db?.close(); }
    }
    try {
      for (const [key, pending] of [...this.pendingFinals]) {
        if (pending.sourceKey === "local") continue;
        if (now - pending.firstSeenAt < settleMilliseconds) continue;
        const row = this.remoteSnapshots.get(pending.sourceKey)?.get(pending.threadId);
        if (row) {
          // Auch Remote-Zustände durchlaufen dieselbe Prüfung: Ein
          // Fehler-Puffer wird bei einem Folge-Turn verworfen, ein fertiger
          // Turn gemeldet.
          const outcome = shouldEmitFinal(pending, row, now, settleMilliseconds);
          if (outcome === "drop") { this.pendingFinals.delete(key); continue; }
          if (outcome === "update") {
            pending.state = row.turnState ?? pending.state;
            pending.turnId = row.turnId ?? pending.turnId;
            pending.snapshot = row;
            pending.firstSeenAt = now;
            continue;
          }
          if (outcome === "wait") continue;
        }
        // Ohne neuen Snapshot zählt der persistierte Stand, damit ein Neustart
        // innerhalb des Fensters die fertige Meldung nicht verwirft.
        const target = row && row.turnId === pending.turnId ? row : pending.snapshot;
        const logs = (this.remoteActivities.get(pending.sourceKey)?.get(pending.threadId) ?? []).map((summary) => redactText(summary, 1_000));
        this.emitFinal(target, pending.environmentId, logs);
        this.pendingFinals.delete(key);
      }
    } catch { /* Beschädigte Puffer oder Cursor dürfen den Poll nicht abbrechen. */ }
  }

  private saveCursor(): void { this.writeCursor(this.options.cursorPath, this.lastSequence, "local"); }

  private saveRemoteCursor(source: RemoteT3Source): void {
    this.writeCursor(this.remoteCursorPath(source), this.remoteStates.get(source.host)?.lastSequence ?? 0, source.host);
  }

  private writeCursor(path: string, lastSequence: number, sourceKey: string): void {
    try {
      mkdirSync(dirname(path), { recursive: true });
      const pendingFinals = [...this.pendingFinals.values()].filter((pending) => pending.sourceKey === sourceKey);
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify({ lastSequence, pendingFinals })}\n`, { encoding: "utf8", mode: 0o600 });
      renameSync(temporary, path);
    } catch { /* Best Effort. */ }
  }

  private environmentId(): string {
    try {
      const raw = readFileSync(this.options.environmentIdPath, "utf8").trim();
      const parsed = raw.startsWith("{") ? JSON.parse(raw) as { id?: unknown } : null;
      return parsed && typeof parsed.id === "string" ? parsed.id : raw;
    } catch { return ""; }
  }

  private process(row: ThreadRow, environmentId: string, allowCompletion: boolean, sourceKey: string): void {
    const prefix = `thread:${row.threadId}:`;
    // Tiefenlink in die Workbench-SPA: Sie öffnet das T3-Panel mit genau
    // diesem Thread (Umgebung für eine zuverlässige Routenauflösung).
    const query = new URLSearchParams({ thread: row.threadId });
    if (environmentId) query.set("env", environmentId);
    const link = `/wrapt/t3-code?${query.toString()}`;
    const body = row.projectTitle ? `${row.projectTitle} · ${row.title}` : row.title;
    if (row.pendingUserInputCount > 0) {
      const remoteId = this.options.notifications.activeRemoteId("t3", "agent.input-required", `${prefix}input`) ?? `${prefix}input:${row.updatedAt}`;
      this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.input-required", severity: "warning",
        title: "T3 Code braucht Input", body, link, remoteId, meta: { threadId: row.threadId, projectId: row.projectId } });
    } else this.options.notifications.resolveMatching("t3", ["agent.input-required"], `${prefix}input`);
    if (row.pendingApprovalCount > 0 || row.hasActionableProposedPlan > 0) {
      const remoteId = this.options.notifications.activeRemoteId("t3", "agent.plan-ready", `${prefix}plan`) ?? `${prefix}plan:${row.updatedAt}`;
      // Info statt Warning: Zwischenpläne ohne echte Freigabe sind normal und
      // dürfen weder Push auslösen noch wie ein Fehler wirken.
      this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.plan-ready", severity: "info",
        title: "T3-Plan ist bereit", body, link, remoteId, meta: { threadId: row.threadId, projectId: row.projectId } });
    } else this.options.notifications.resolveMatching("t3", ["agent.plan-ready"], `${prefix}plan`);

    if (!allowCompletion || !row.turnId) return;
    if (row.turnState !== "completed" && row.turnState !== "error" && row.turnState !== "interrupted") return;
    const duration = durationSeconds(row);
    const usedTools = row.toolCount > 0;
    if (row.turnState === "completed" && (duration < this.options.miniTaskSeconds || (duration < this.options.completionMinimumSeconds && !usedTools))) return;
    const key = `${sourceKey}:${row.threadId}`;
    const existing = this.pendingFinals.get(key);
    if (existing && existing.turnId === row.turnId && existing.state === row.turnState) return;
    // Ein fertiger Turn geht nicht verloren, wenn der Thread sofort mit einem
    // neuen Turn weitermacht: Er wird gemeldet, bevor der neue ihn verdrängt.
    if (existing && existing.turnId !== row.turnId && existing.state === "completed") {
      this.emitFinal(existing.snapshot, existing.environmentId, []);
    }
    this.pendingFinals.set(key, { sourceKey, environmentId, threadId: row.threadId, turnId: row.turnId, state: row.turnState, firstSeenAt: Date.now(), snapshot: row });
  }

  private emitFinal(row: ThreadRow, environmentId: string, logs: string[]): void {
    const query = new URLSearchParams({ thread: row.threadId });
    if (environmentId) query.set("env", environmentId);
    const link = `/wrapt/t3-code?${query.toString()}`;
    const body = row.projectTitle ? `${row.projectTitle} · ${row.title}` : row.title;
    const duration = durationSeconds(row);
    // Eine gemeinsame Remote-ID pro Turn: Ein Turn darf nur ein finales
    // Ergebnis erhalten, egal ob zuerst Fehler und später Erfolg gemeldet wird.
    const remoteId = `thread:${row.threadId}:turn:${row.turnId}`;
    if (row.turnState === "completed") {
      this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.completed", severity: "success",
        title: "T3-Aufgabe abgeschlossen", body, link, remoteId,
        meta: { threadId: row.threadId, projectId: row.projectId, durationSeconds: Math.round(duration), usedTools: row.toolCount > 0 } });
      return;
    }
    const rawError = row.lastError || (row.turnState === "interrupted" ? "Die T3-Aufgabe wurde abgebrochen." : "Die T3-Aufgabe ist fehlgeschlagen.");
    this.options.notifications.create({ source: "t3", category: "coding-agent", sourceIcon: "t3", kind: "agent.failed", severity: row.turnState === "error" ? "error" : "warning",
      title: row.turnState === "error" ? "T3-Aufgabe fehlgeschlagen" : "T3-Aufgabe abgebrochen", body, link, remoteId,
      meta: { threadId: row.threadId, projectId: row.projectId, durationSeconds: Math.round(duration) },
      report: { message: redactText(rawError, 4_000), stack: null, context: { Quelle: "T3 Code", Aufgabe: row.title, Projekt: row.projectId, Thread: row.threadId }, logs, environment: {} } });
  }
}
