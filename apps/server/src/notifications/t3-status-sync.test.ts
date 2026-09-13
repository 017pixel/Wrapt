import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationDatabase } from "./database.js";
import { mergeRemoteSnapshot, T3StatusSync, type ThreadRow } from "./t3-status-sync.js";
import { REMOTE_READER_SCRIPT } from "./t3-remote-reader.js";

const directories: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function finishTurn(dbPath: string, options: { state: string; completedAt: string; sequence: number }): void {
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE projection_threads SET pending_user_input_count=0, settled_at=?, updated_at=? WHERE thread_id='thread-1'").run(options.completedAt, options.completedAt);
  db.prepare("UPDATE projection_thread_sessions SET status='stopped' WHERE thread_id='thread-1'").run();
  db.prepare("UPDATE projection_turns SET state=?,completed_at=? WHERE row_id=1").run(options.state, options.completedAt);
  db.prepare("INSERT INTO orchestration_events VALUES(?, 'thread', 'thread-1')").run(options.sequence);
  db.close();
}

function fixture(options: { finalSettleSeconds?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-t3-sync-")); directories.push(directory);
  const t3Path = join(directory, "t3.sqlite"); const db = new DatabaseSync(t3Path);
  db.exec(`CREATE TABLE orchestration_events(sequence INTEGER PRIMARY KEY, aggregate_kind TEXT, stream_id TEXT);
    CREATE TABLE projection_projects(project_id TEXT PRIMARY KEY,title TEXT,workspace_root TEXT,scripts_json TEXT,created_at TEXT,updated_at TEXT,deleted_at TEXT,default_model_selection_json TEXT);
    CREATE TABLE projection_threads(thread_id TEXT PRIMARY KEY,title TEXT,project_id TEXT,updated_at TEXT,deleted_at TEXT,pending_approval_count INTEGER,pending_user_input_count INTEGER,has_actionable_proposed_plan INTEGER,settled_at TEXT);
    CREATE TABLE projection_thread_sessions(thread_id TEXT PRIMARY KEY,status TEXT,last_error TEXT);
    CREATE TABLE projection_turns(row_id INTEGER PRIMARY KEY,thread_id TEXT,turn_id TEXT,state TEXT,started_at TEXT,completed_at TEXT);
    CREATE TABLE projection_thread_activities(thread_id TEXT,turn_id TEXT,kind TEXT,summary TEXT,created_at TEXT);`);
  db.prepare("INSERT INTO projection_projects VALUES(?,?,?,?,?,?,NULL,NULL)").run("project-1", "Workbench", "/srv/projects/wrapt", "{}", "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  const now = new Date(); const started = new Date(now.getTime() - 180_000).toISOString(); const completed = now.toISOString();
  db.prepare("INSERT INTO projection_threads VALUES(?,?,?,?,NULL,0,1,0,NULL)").run("thread-1", "Inbox bauen", "project-1", completed);
  db.prepare("INSERT INTO projection_thread_sessions VALUES(?,?,NULL)").run("thread-1", "running");
  db.prepare("INSERT INTO projection_turns VALUES(1,?,?,?,?,?)").run("thread-1", "turn-1", "running", started, null);
  db.prepare("INSERT INTO orchestration_events VALUES(1,'thread','thread-1')").run(); db.close();
  const environmentIdPath = join(directory, "environment-id"); writeFileSync(environmentIdPath, "environment-1\n");
  const notifications = new NotificationDatabase(join(directory, "notifications.sqlite"));
  const sync = new T3StatusSync({ databasePath: t3Path, environmentIdPath, notifications, pollSeconds: 5, completionMinimumSeconds: 120, miniTaskSeconds: 30, finalSettleSeconds: options.finalSettleSeconds ?? 0, cursorPath: join(directory, "cursor.json") });
  return { dbPath: t3Path, notifications, sync, completed };
}

describe("T3-Status-Synchronisation", () => {
  it("erzeugt wartenden Input und löst ihn nach dem nächsten Event auf", async () => {
    const { dbPath, notifications, sync } = fixture();
    await sync.poll();
    const first = notifications.list().notifications[0]!;
    expect(first.kind).toBe("agent.input-required");
    // Tiefenlink in die SPA statt in den T3-Proxy; Body nennt Projekt und Thread.
    expect(first.link).toBe("/wrapt/t3-code?thread=thread-1&env=environment-1");
    expect(first.body).toBe("Workbench · Inbox bauen");
    const db = new DatabaseSync(dbPath); db.prepare("UPDATE projection_threads SET pending_user_input_count=0 WHERE thread_id='thread-1'").run(); db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    await sync.poll();
    expect(notifications.list().notifications).toEqual([]);
    notifications.close();
  });

  it("meldet Pläne als Info statt Warning", async () => {
    const { dbPath, notifications, sync } = fixture();
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE projection_threads SET pending_user_input_count=0, has_actionable_proposed_plan=1 WHERE thread_id='thread-1'").run();
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    await sync.poll();
    const plan = notifications.list().notifications.find((item) => item.kind === "agent.plan-ready");
    expect(plan?.severity).toBe("info");
    notifications.close();
  });

  it("behält bei weiterer Thread-Aktivität dieselbe offene Remote-Meldung", async () => {
    const { dbPath, notifications, sync } = fixture();
    await sync.poll();
    const first = notifications.list().notifications[0]!;
    const db = new DatabaseSync(dbPath);
    const updated = new Date(Date.parse(first.createdAt) + 1_000).toISOString();
    db.prepare("UPDATE projection_threads SET title=?, updated_at=? WHERE thread_id='thread-1'").run("Inbox weiterbauen", updated);
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run();
    db.close();
    await sync.poll();
    const current = notifications.list().notifications;
    expect(current).toHaveLength(1);
    expect(current[0]?.id).toBe(first.id);
    expect(current[0]?.remoteId).toBe(first.remoteId);
    notifications.close();
  });

  it("verarbeitet Abschlüsse nur nach dem gespeicherten Event-Cursor", async () => {
    const { dbPath, notifications, sync, completed } = fixture();
    await sync.poll();
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE projection_threads SET pending_user_input_count=0, settled_at=?, updated_at=? WHERE thread_id='thread-1'").run(completed, completed);
    db.prepare("UPDATE projection_thread_sessions SET status='stopped' WHERE thread_id='thread-1'").run();
    db.prepare("UPDATE projection_turns SET state='completed',completed_at=? WHERE row_id=1").run(completed);
    db.prepare("INSERT INTO projection_thread_activities VALUES('thread-1','turn-1','tool.completed','Werkzeug ausgeführt',?)").run(completed);
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    await sync.poll();
    expect(notifications.list().notifications.some((item) => item.kind === "agent.completed")).toBe(true);
    notifications.close();
  });

  it("meldet nach einem Sequenz-Reset keine gelöschten alten Abschlüsse erneut", async () => {
    const { dbPath, notifications, sync, completed } = fixture();
    await sync.poll();
    const db = new DatabaseSync(dbPath);
    db.prepare("UPDATE projection_threads SET pending_user_input_count=0, settled_at=?, updated_at=? WHERE thread_id='thread-1'").run(completed, completed);
    db.prepare("UPDATE projection_thread_sessions SET status='stopped' WHERE thread_id='thread-1'").run();
    db.prepare("UPDATE projection_turns SET state='completed',completed_at=? WHERE row_id=1").run(completed);
    db.prepare("INSERT INTO orchestration_events VALUES(2,'thread','thread-1')").run(); db.close();
    await sync.poll();
    const done = notifications.list().notifications.find((item) => item.kind === "agent.completed")!;
    expect(done).toBeDefined();
    // Eintrag erledigen und aus der Aufbewahrung löschen, danach die
    // T3-Datenbank neu anlegen: Die Sequenz springt zurück und der alte
    // Thread liegt wieder im Lesefenster.
    notifications.resolveByRemoteId("t3", "agent.completed", done.remoteId!);
    notifications.prune(Date.now() + 49 * 3_600_000);
    expect(notifications.get(done.id)).toBeNull();
    const fresh = new DatabaseSync(dbPath);
    fresh.exec("DELETE FROM orchestration_events");
    fresh.prepare("INSERT INTO orchestration_events VALUES(1,'thread','thread-1')").run();
    fresh.close();
    await sync.poll();
    expect(notifications.list().notifications).toEqual([]);
    notifications.close();
  });

  it("meldet einen finalen Turn erst nach dem Stabilitätsfenster", async () => {
    vi.useFakeTimers();
    const { dbPath, notifications, sync } = fixture({ finalSettleSeconds: 30 });
    await sync.poll();
    const completedAt = new Date().toISOString();
    finishTurn(dbPath, { state: "completed", completedAt, sequence: 2 });
    await sync.poll();
    expect(notifications.list().notifications.filter((item) => item.kind === "agent.completed")).toEqual([]);
    vi.advanceTimersByTime(31_000);
    await sync.poll();
    expect(notifications.list().notifications.filter((item) => item.kind === "agent.completed")).toHaveLength(1);
    notifications.close();
  });

  it("korrigiert einen transienten Fehler innerhalb des Fensters zu einem Abschluss", async () => {
    vi.useFakeTimers();
    const { dbPath, notifications, sync } = fixture({ finalSettleSeconds: 30 });
    await sync.poll();
    finishTurn(dbPath, { state: "error", completedAt: new Date().toISOString(), sequence: 2 });
    await sync.poll();
    expect(notifications.list().notifications.filter((item) => item.kind === "agent.failed")).toEqual([]);
    vi.advanceTimersByTime(5_000);
    finishTurn(dbPath, { state: "completed", completedAt: new Date().toISOString(), sequence: 3 });
    await sync.poll();
    vi.advanceTimersByTime(31_000);
    await sync.poll();
    const entries = notifications.list().notifications;
    expect(entries.filter((item) => item.kind === "agent.failed")).toEqual([]);
    expect(entries.filter((item) => item.kind === "agent.completed")).toHaveLength(1);
    notifications.close();
  });

  it("meldet einen fertigen Turn auch, wenn kurz darauf ein neuer Turn startet", async () => {
    const { dbPath, notifications, sync } = fixture({ finalSettleSeconds: 30 });
    await sync.poll();
    finishTurn(dbPath, { state: "completed", completedAt: new Date().toISOString(), sequence: 2 });
    await sync.poll();
    // Bevor das Fenster abläuft, beginnt Turn 2.
    const db = new DatabaseSync(dbPath);
    db.prepare("INSERT INTO projection_turns VALUES(2, 'thread-1', 'turn-2', 'running', ?, NULL)").run(new Date().toISOString());
    db.close();
    await sync.poll();
    expect(notifications.list().notifications.filter((item) => item.kind === "agent.completed")).toHaveLength(1);
    notifications.close();
  });

  it("verwirft einen Fehler-Turn, wenn der Thread direkt mit einem neuen Turn fortsetzt", async () => {
    const { dbPath, notifications, sync } = fixture({ finalSettleSeconds: 30 });
    await sync.poll();
    finishTurn(dbPath, { state: "error", completedAt: new Date().toISOString(), sequence: 2 });
    await sync.poll();
    const db = new DatabaseSync(dbPath);
    db.prepare("INSERT INTO projection_turns VALUES(2, 'thread-1', 'turn-2', 'running', ?, NULL)").run(new Date().toISOString());
    db.close();
    await sync.poll();
    expect(notifications.list().notifications).toHaveLength(0);
    notifications.close();
  });

  it("meldet einen abgeschlossenen Turn, bevor ein finaler Folge-Turn ihn verdrängt", async () => {
    const { dbPath, notifications, sync } = fixture({ finalSettleSeconds: 30 });
    await sync.poll();
    finishTurn(dbPath, { state: "completed", completedAt: new Date().toISOString(), sequence: 2 });
    await sync.poll();
    // Turn 2 startet und scheitert sofort, noch innerhalb des Fensters.
    const db = new DatabaseSync(dbPath);
    db.prepare("INSERT INTO projection_turns VALUES(2, 'thread-1', 'turn-2', 'error', ?, ?)").run(new Date(Date.now() - 60_000).toISOString(), new Date().toISOString());
    db.prepare("INSERT INTO orchestration_events VALUES(3, 'thread', 'thread-1')").run();
    db.close();
    await sync.poll();
    const entries = notifications.list().notifications;
    expect(entries.filter((item) => item.kind === "agent.completed")).toHaveLength(1);
    expect(entries.filter((item) => item.kind === "agent.failed")).toEqual([]);
    notifications.close();
  });

  it("verwirft einen Remote-Fehler-Puffer, wenn der Folge-Turn schon läuft", () => {
    const { notifications, sync } = fixture({ finalSettleSeconds: 0 });
    const failedRow = {
      threadId: "thread-1", title: "Inbox bauen", projectId: "project-1", projectTitle: "Workbench", updatedAt: new Date().toISOString(),
      pendingApprovalCount: 0, pendingUserInputCount: 0, hasActionableProposedPlan: 0, settledAt: null, sessionStatus: "running",
      lastError: "kaputt", turnId: "turn-r1", turnState: "error", startedAt: new Date(Date.now() - 300_000).toISOString(), completedAt: new Date().toISOString(), toolCount: 0,
    } as ThreadRow;
    const runningRow = { ...failedRow, turnId: "turn-r2", turnState: "running", lastError: null } as ThreadRow;
    sync["remoteSnapshots"].set("host", mergeRemoteSnapshot(undefined, [runningRow]));
    sync["pendingFinals"].set("host:thread-1", { sourceKey: "host", environmentId: "env", threadId: "thread-1", turnId: "turn-r1", state: "error", firstSeenAt: Date.now() - 1_000, snapshot: failedRow });
    sync["settleFinals"]();
    expect(notifications.list().notifications).toEqual([]);
    notifications.close();
  });

  it("stellt gepufferte Ergebnisse nach einem Neustart aus dem Cursor wieder her", () => {
    const { dbPath, notifications, sync } = fixture({ finalSettleSeconds: 0 });
    const cursorPath = (sync as unknown as { options: { cursorPath: string } }).options.cursorPath;
    const row = {
      threadId: "thread-1", title: "Inbox bauen", projectId: "project-1", projectTitle: "Workbench", updatedAt: new Date().toISOString(),
      pendingApprovalCount: 0, pendingUserInputCount: 0, hasActionableProposedPlan: 0, settledAt: null, sessionStatus: "stopped",
      lastError: null, turnId: "turn-restored", turnState: "completed", startedAt: new Date(Date.now() - 300_000).toISOString(), completedAt: new Date().toISOString(), toolCount: 1,
    } as ThreadRow;
    writeFileSync(cursorPath, JSON.stringify({ lastSequence: 0, pendingFinals: [{ sourceKey: "host", environmentId: "env", threadId: "thread-1", turnId: "turn-restored", state: "completed", firstSeenAt: Date.now() - 1_000, snapshot: row }] }));
    const restored = new T3StatusSync({ databasePath: dbPath, environmentIdPath: join(dirname(dbPath), "environment-id"), notifications, pollSeconds: 5, completionMinimumSeconds: 120, miniTaskSeconds: 30, finalSettleSeconds: 0, cursorPath });
    restored["settleFinals"]();
    const entries = notifications.list().notifications;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "agent.completed", remoteId: "thread:thread-1:turn:turn-restored" });
    notifications.close();
  });

  it("meldet denselben finalen Turn genau einmal", async () => {
    const { dbPath, notifications, sync } = fixture();
    await sync.poll();
    finishTurn(dbPath, { state: "completed", completedAt: new Date().toISOString(), sequence: 2 });
    await sync.poll();
    expect(notifications.list().notifications.filter((item) => item.kind === "agent.completed")).toHaveLength(1);
    // Derselbe Turn bleibt stehen, auch wenn die Quelle ihn erneut liefert.
    await sync.poll();
    const again = new DatabaseSync(dbPath);
    again.prepare("INSERT INTO orchestration_events VALUES(3, 'thread', 'thread-1')").run();
    again.close();
    await sync.poll();
    expect(notifications.list().notifications.filter((item) => item.kind === "agent.completed")).toHaveLength(1);
    notifications.close();
  });

  it("meldet Mini-Tasks ohne Werkzeuge nicht", async () => {
    const { dbPath, notifications, sync } = fixture();
    await sync.poll();
    const db = new DatabaseSync(dbPath);
    const started = new Date(Date.now() - 10_000).toISOString();
    const completedAt = new Date().toISOString();
    db.prepare("UPDATE projection_turns SET state='completed',started_at=?,completed_at=? WHERE row_id=1").run(started, completedAt);
    db.prepare("UPDATE projection_threads SET pending_user_input_count=0 WHERE thread_id='thread-1'").run();
    db.prepare("INSERT INTO orchestration_events VALUES(2, 'thread', 'thread-1')").run();
    db.close();
    await sync.poll();
    expect(notifications.list().notifications.filter((item) => item.kind === "agent.completed")).toEqual([]);
    notifications.close();
  });

  it("behält Remote-Zeilen, wenn der nächste Poll keine neuen Ereignisse liefert", () => {
    const row = { threadId: "thread-1", turnId: "turn-1", turnState: "completed" } as ThreadRow;
    const previous = new Map([["thread-1", row]]);
    const merged = mergeRemoteSnapshot(previous, []);
    expect(merged.get("thread-1")).toBe(row);
    const refreshed = { ...row, turnState: "error" } as ThreadRow;
    expect(mergeRemoteSnapshot(previous, [refreshed]).get("thread-1")?.turnState).toBe("error");
    expect(mergeRemoteSnapshot(undefined, [refreshed], 1).size).toBe(1);
  });

  it("meldet einen gepufferten Remote-Turn nach dem Fenster auch ohne neuen Snapshot", () => {
    const { notifications, sync } = fixture({ finalSettleSeconds: 0 });
    const row = {
      threadId: "thread-1", title: "Inbox bauen", projectId: "project-1", projectTitle: "Workbench", updatedAt: new Date().toISOString(),
      pendingApprovalCount: 0, pendingUserInputCount: 0, hasActionableProposedPlan: 0, settledAt: null, sessionStatus: "stopped",
      lastError: null, turnId: "turn-remote", turnState: "completed", startedAt: new Date(Date.now() - 300_000).toISOString(), completedAt: new Date().toISOString(), toolCount: 1,
    } as ThreadRow;
    sync["remoteSnapshots"].set("benjaminsserver2", mergeRemoteSnapshot(undefined, [row]));
    sync["pendingFinals"].set("benjaminsserver2:thread-1", { sourceKey: "benjaminsserver2", environmentId: "environment-remote", threadId: "thread-1", turnId: "turn-remote", state: "completed", firstSeenAt: Date.now() - 1_000, snapshot: row });
    sync["settleFinals"]();
    const entries = notifications.list().notifications;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "agent.completed", severity: "success", remoteId: "thread:thread-1:turn:turn-remote" });
    expect(entries[0]?.link).toBe("/wrapt/t3-code?thread=thread-1&env=environment-remote");
    notifications.close();
  });

  it("liest entfernte T3-Instanzen über das Python-Skript und meldet deren Threads", async () => {
    const { dbPath, notifications } = fixture();
    const environmentIdPath = join(dirname(dbPath), "environment-id");
    // Das Skript direkt ausführen, wie es ssh über `echo | base64 -d |
    // python3 -` tut. Der SSH-Aufruf selbst ist nur execFile und wird hier
    // nicht geprüft.
    const stdout = execFileSync("python3", ["-c", REMOTE_READER_SCRIPT, dbPath, environmentIdPath, "0", "0"], { encoding: "utf8" });
    const snapshot = JSON.parse(stdout) as { environmentId: string; rows: Array<{ threadId: string; title: string }> };
    expect(snapshot.environmentId).toBe("environment-1");
    expect(snapshot.rows).toHaveLength(1);
    expect(snapshot.rows[0]?.threadId).toBe("thread-1");
    expect(snapshot.rows[0]?.title).toBe("Inbox bauen");
    // Die Remote-Verarbeitung mit der gelieferten Umgebung: gleicher
    // Deep-Link wie lokal, aber mit der entfernten environmentId.
    const syncWithRemote = new T3StatusSync({ databasePath: dbPath, environmentIdPath, notifications, pollSeconds: 5, completionMinimumSeconds: 120, miniTaskSeconds: 30, cursorPath: join(dirname(dbPath), "cursor.json") });
    const rows = snapshot.rows;
    const first = notifications.list().notifications[0];
    expect(first).toBeUndefined();
    // process läuft über poll(); da die Quelle lokal dieselbe DB ist, entsteht
    // hier keine zweite Meldung (Dedupe über remoteId).
    syncWithRemote["process"](rows[0] as ThreadRow, "environment-2", false, "local");
    const created = notifications.list().notifications[0]!;
    expect(created.kind).toBe("agent.input-required");
    expect(created.link).toBe("/wrapt/t3-code?thread=thread-1&env=environment-2");
    notifications.close();
  });
});
