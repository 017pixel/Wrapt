import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { NotificationDatabase } from "./database.js";
import { AgentSessionSync } from "./agent-session-sync.js";
import { TerminalStatusSync } from "./terminal-status-sync.js";
import { T3StatusSync } from "./t3-status-sync.js";

/**
 * Stresstest: Viele gleichzeitige Ereignisse dürfen weder eine Flut noch
 * Doppelmeldungen erzeugen. Jedes Ereignis bekommt genau eine Meldung,
 * wiederholte Polls bleiben folgenlos.
 */

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), "wrapt-notification-stress-"));
  directories.push(path);
  return path;
}

function openCodeDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE event(aggregate_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE session(id TEXT PRIMARY KEY, directory TEXT NOT NULL, title TEXT NOT NULL, time_created INTEGER NOT NULL,
      parent_id TEXT, time_updated INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE part(message_id TEXT NOT NULL, data TEXT NOT NULL);`);
  return db;
}

function t3Database(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE orchestration_events(sequence INTEGER PRIMARY KEY, aggregate_kind TEXT, stream_id TEXT);
    CREATE TABLE projection_projects(project_id TEXT PRIMARY KEY,title TEXT,workspace_root TEXT);
    CREATE TABLE projection_threads(thread_id TEXT PRIMARY KEY,title TEXT,project_id TEXT,updated_at TEXT,deleted_at TEXT,pending_approval_count INTEGER,pending_user_input_count INTEGER,has_actionable_proposed_plan INTEGER,settled_at TEXT);
    CREATE TABLE projection_thread_sessions(thread_id TEXT PRIMARY KEY,status TEXT,last_error TEXT,updated_at TEXT);
    CREATE TABLE projection_turns(row_id INTEGER PRIMARY KEY,thread_id TEXT,turn_id TEXT,state TEXT,started_at TEXT,completed_at TEXT);
    CREATE TABLE projection_thread_activities(thread_id TEXT,turn_id TEXT,kind TEXT,summary TEXT,created_at TEXT);`);
  return db;
}

describe("Notification-Stresstest", () => {
  it("bündelt 2000 OpenCode-Abschlüsse aus 50 Läufen auf 50 Meldungen – ohne T3- oder Subagenten-Duplikate", { timeout: 30_000 }, () => {
    const path = directory();
    const opencodePath = join(path, "opencode.sqlite");
    const db = openCodeDatabase(opencodePath);
    const now = Date.now();
    let rowId = 0;
    const insert = (sessionId: string, messageId: string) => {
      rowId += 1;
      db.prepare("INSERT INTO event(rowid, aggregate_id, type, data) VALUES(?,?,?,?)").run(rowId, sessionId, "message.updated.1", JSON.stringify({ info: { id: messageId, role: "assistant", time: { created: rowId * 100, completed: rowId * 100 + 50 } } }));
      db.prepare("INSERT INTO part(message_id, data) VALUES(?,?)").run(messageId, JSON.stringify({ type: "tool" }));
    };
    // 40 normale Läufe mit je 40 Antworten, 5 Subagenten unter einem Lauf und
    // 5 T3-Sitzungen im aktiven T3-Projektverzeichnis.
    db.prepare("INSERT INTO session VALUES(?,?,?,?,?,?)").run("root", "/home/bbecker/projects/anderes", "Hauptlauf", now, null, now);
    for (let run = 0; run < 40; run += 1) {
      const id = `lauf-${run}`;
      db.prepare("INSERT INTO session VALUES(?,?,?,?,?,?)").run(id, "/home/bbecker/projects/anderes", `Lauf ${run}`, now, null, now);
      for (let message = 0; message < 40; message += 1) insert(id, `${id}-m${message}`);
    }
    for (let sub = 0; sub < 5; sub += 1) {
      const id = `sub-${sub}`;
      db.prepare("INSERT INTO session VALUES(?,?,?,?,?,?)").run(id, "/home/bbecker/projects/anderes", `Sub ${sub} (@explore subagent)`, now, "root", now);
      for (let message = 0; message < 40; message += 1) insert(id, `${id}-m${message}`);
    }
    for (let t3 = 0; t3 < 5; t3 += 1) {
      const id = `t3-${t3}`;
      db.prepare("INSERT INTO session VALUES(?,?,?,?,?,?)").run(id, "/workspace", `T3 Lauf ${t3}`, now, null, now);
      for (let message = 0; message < 40; message += 1) insert(id, `${id}-m${message}`);
    }
    db.close();

    const t3Path = join(path, "t3.sqlite");
    const t3 = t3Database(t3Path);
    t3.prepare("INSERT INTO projection_projects VALUES(?,?,?)").run("p", "Wrapt", "/workspace");
    t3.prepare("INSERT INTO projection_threads VALUES(?,?,?,?,NULL,0,0,0,NULL)").run("thread", "Beliebiger Titel", "p", new Date(now).toISOString());
    t3.prepare("INSERT INTO projection_thread_sessions VALUES(?,?,NULL,?)").run("thread", "running", new Date(now).toISOString());
    t3.prepare("INSERT INTO projection_turns VALUES(1,?,?,?,?,NULL)").run("thread", "turn-1", "running", new Date(now).toISOString());
    t3.close();

    const notifications = new NotificationDatabase(join(path, "notifications.sqlite"));
    const sync = new AgentSessionSync({ opencodeDatabasePath: opencodePath, t3DatabasePath: t3Path, codexSessionsPath: join(path, "codex"), cursorPath: join(path, "cursor.json"), notifications, pollSeconds: 5, completionMinimumSeconds: 30, runIdleSeconds: 90 });
    const poll = () => (sync as unknown as { poll(emit: boolean): void }).poll(true);
    // 2000 Ereignisse, maximal 500 pro Poll: Die Läufe werden gesammelt.
    for (let round = 0; round < 4; round += 1) poll();
    const live = new DatabaseSync(opencodePath);
    live.prepare("UPDATE session SET time_updated=?").run(now - 120_000);
    live.close();
    poll();
    // 40 normale Läufe + der Hauptlauf mit 5 Subagenten = 41 Meldungen.
    const entries = notifications.list({ limit: 100 }).notifications;
    expect(entries).toHaveLength(41);
    expect(entries.every((item) => item.kind === "agent.completed" && item.severity === "success")).toBe(true);
    const responses = entries.reduce((sum, item) => sum + Number(item.meta.responses ?? 0), 0);
    expect(responses).toBe(40 * 40 + 5 * 40);
    // Wiederholte Polls liefern keine neuen Meldungen.
    poll(); poll();
    expect(notifications.list({ limit: 100 }).notifications).toHaveLength(41);
    sync.stop();
    notifications.close();
  });

  it("meldet 50 T3-Turns mit transienten Fehlern und Wiederholungen genau einmal", async () => {
    const path = directory();
    const t3Path = join(path, "t3.sqlite");
    const db = t3Database(t3Path);
    db.prepare("INSERT INTO projection_projects VALUES(?,?,?)").run("p", "Wrapt", "/srv/wrapt");
    const completedAt = new Date(Date.now() - 60_000).toISOString();
    const startedAt = new Date(Date.now() - 240_000).toISOString();
    for (let turn = 0; turn < 50; turn += 1) {
      const threadId = `thread-${turn}`;
      db.prepare("INSERT INTO projection_threads VALUES(?,?,?,?,NULL,0,0,0,?)").run(threadId, `Aufgabe ${turn}`, "p", completedAt, completedAt);
      db.prepare("INSERT INTO projection_thread_sessions VALUES(?,?,NULL,?)").run(threadId, "stopped", completedAt);
      db.prepare("INSERT INTO projection_turns VALUES(?,?,?,?,?,?)").run(turn + 1, threadId, `turn-${turn}`, turn % 10 === 7 ? "error" : "completed", startedAt, completedAt);
      db.prepare("INSERT INTO projection_thread_activities VALUES(?,?,?,?,?)").run(threadId, `turn-${turn}`, "tool.completed", "Werkzeug", completedAt);
      db.prepare("INSERT INTO orchestration_events VALUES(?, 'thread', ?)").run(turn + 1, threadId);
    }
    db.close();
    const environmentIdPath = join(path, "environment-id");
    const notifications = new NotificationDatabase(join(path, "notifications.sqlite"));
    const cursorPath = join(path, "cursor.json");
    writeFileSync(cursorPath, JSON.stringify({ lastSequence: 0 }));
    const sync = new T3StatusSync({ databasePath: t3Path, environmentIdPath, notifications, pollSeconds: 5, completionMinimumSeconds: 120, miniTaskSeconds: 30, finalSettleSeconds: 0, cursorPath });
    await sync.poll();
    const entries = notifications.list({ limit: 100 }).notifications;
    expect(entries).toHaveLength(50);
    expect(entries.filter((item) => item.kind === "agent.completed")).toHaveLength(45);
    expect(entries.filter((item) => item.kind === "agent.failed" && item.severity === "error")).toHaveLength(5);
    // Ein weiterer Poll darf keinen einzigen Eintrag wiederholen.
    await sync.poll();
    expect(notifications.list({ limit: 100 }).notifications).toHaveLength(50);
    notifications.close();
  });

  it("meldet 100 Terminal-Enden ohne abgebrochene oder manuell geschlossene Fehlmeldungen", () => {
    const path = directory();
    const databasePath = join(path, "wrapt.sqlite");
    const db = new DatabaseSync(databasePath);
    db.exec(`CREATE TABLE terminal_sessions (
      id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, kind TEXT NOT NULL, project_id TEXT, cwd TEXT NOT NULL,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      exit_code INTEGER, exit_signal INTEGER, started_at TEXT, ended_at TEXT)`);
    const now = Date.now();
    for (let index = 0; index < 100; index += 1) {
      const kind = index % 3 === 0 ? "shell" : "opencode";
      db.prepare("INSERT INTO terminal_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(`session-${index}`, `runtime-${index}`, kind, "project-1", "/srv/workbench", "running", now - 600_000, now - 100_000, null, null, null, null);
    }
    db.close();
    const notifications = new NotificationDatabase(databasePath);
    const sync = new TerminalStatusSync({ databasePath, notifications, pollSeconds: 5, terminalMinimumSeconds: 5, agentMinimumSeconds: 5 });
    const snapshot = (emit: boolean) => (sync as unknown as { snapshot(emit: boolean): void }).snapshot(emit);
    snapshot(false);
    // Die laufenden Sitzungen enden jetzt gemischt: abgebrochen, manuell
    // geschlossen oder mit echtem Exit-Code.
    const live = new DatabaseSync(databasePath);
    for (let index = 0; index < 100; index += 1) {
      const status = index < 30 ? "interrupted" : index < 60 ? "closed" : "exited";
      const exitCode = index < 60 ? null : index % 9 === 0 ? 1 : 0;
      live.prepare("UPDATE terminal_sessions SET status=?, exit_code=?, updated_at=? WHERE id=?").run(status, exitCode, now - 50_000, `session-${index}`);
    }
    live.close();
    snapshot(true);
    // 30 abgebrochene und 30 geschlossene Läufe bleiben still. Echte Exits
    // werden gemeldet, Fehler immer, Erfolge nur für Shell-Läufe; Agenten-
    // Erfolge übernimmt der Agenten-Sync, damit nichts doppelt erscheint.
    let expectedCompleted = 0;
    let expectedFailed = 0;
    for (let index = 60; index < 100; index += 1) {
      const kind = index % 3 === 0 ? "shell" : "opencode";
      if (index % 9 === 0) expectedFailed += 1;
      else if (kind === "shell") expectedCompleted += 1;
    }
    const entries = notifications.list({ limit: 100 }).notifications;
    expect(entries).toHaveLength(expectedCompleted + expectedFailed);
    expect(entries.filter((item) => item.kind === "terminal.failed")).toHaveLength(expectedFailed);
    expect(entries.filter((item) => item.kind === "agent.completed")).toHaveLength(expectedCompleted);
    snapshot(true);
    expect(notifications.list({ limit: 100 }).notifications).toHaveLength(expectedCompleted + expectedFailed);
    sync.stop();
    notifications.close();
  });
});
