import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { NotificationDatabase } from "./database.js";
import { AgentSessionSync, matchesT3Directory } from "./agent-session-sync.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function fixture(options: { runIdleSeconds?: number } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-agent-sync-"));
  directories.push(directory);
  const opencodePath = join(directory, "opencode.sqlite");
  const db = new DatabaseSync(opencodePath);
  db.exec(`CREATE TABLE event(aggregate_id TEXT NOT NULL, type TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE session(id TEXT PRIMARY KEY, directory TEXT NOT NULL, title TEXT NOT NULL, time_created INTEGER NOT NULL,
      parent_id TEXT, time_updated INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE part(message_id TEXT NOT NULL, data TEXT NOT NULL);`);
  db.close();
  const t3Path = join(directory, "t3.sqlite");
  const t3 = new DatabaseSync(t3Path);
  t3.exec(`CREATE TABLE projection_projects(project_id TEXT PRIMARY KEY, workspace_root TEXT);
    CREATE TABLE projection_threads(thread_id TEXT PRIMARY KEY, title TEXT NOT NULL, project_id TEXT, updated_at TEXT, deleted_at TEXT);
    CREATE TABLE projection_thread_sessions(thread_id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
    CREATE TABLE projection_turns(row_id INTEGER PRIMARY KEY, thread_id TEXT, turn_id TEXT, state TEXT, started_at TEXT, completed_at TEXT);`);
  const startedAt = new Date().toISOString();
  t3.prepare("INSERT INTO projection_projects VALUES(?,?)").run("project", "/workspace");
  t3.prepare("INSERT INTO projection_threads VALUES(?,?,?,?,NULL)").run("thread", "Planung Skill-Editor-Tool für Coding-Agents", "project", startedAt);
  t3.prepare("INSERT INTO projection_thread_sessions VALUES(?,?,?)").run("thread", "running", startedAt);
  t3.prepare("INSERT INTO projection_turns VALUES(1,?,?,?,?,NULL)").run("thread", "turn-1", "running", startedAt);
  t3.close();
  const codexPath = join(directory, "codex");
  const cursorPath = join(directory, "cursor.json");
  const notifications = new NotificationDatabase(join(directory, "notifications.sqlite"));
  const sync = new AgentSessionSync({ opencodeDatabasePath: opencodePath, t3DatabasePath: t3Path, codexSessionsPath: codexPath, cursorPath, notifications, pollSeconds: 5, completionMinimumSeconds: 30, runIdleSeconds: options.runIdleSeconds ?? 0 });
  return { directory, opencodePath, t3Path, cursorPath, notifications, sync };
}

function addSession(path: string, id: string, options: { title?: string; directory?: string; parentId?: string | null; timeCreated?: number; timeUpdated?: number } = {}): void {
  const db = new DatabaseSync(path);
  db.prepare("INSERT INTO session(id, directory, title, time_created, parent_id, time_updated) VALUES(?,?,?,?,?,?)")
    .run(id, options.directory ?? "/workspace", options.title ?? "Feature umsetzen", options.timeCreated ?? 0, options.parentId ?? null, options.timeUpdated ?? options.timeCreated ?? 0);
  db.close();
}

function appendAssistantCompletion(path: string, sessionId: string, messageId: string, completed = 45_000, options: { created?: number; error?: string; usedTool?: boolean } = {}): void {
  const db = new DatabaseSync(path);
  db.prepare("INSERT INTO event(aggregate_id,type,data) VALUES(?,?,?)").run(sessionId, "message.updated.1", JSON.stringify({ info: { id: messageId, role: "assistant", time: { created: options.created ?? 0, completed }, error: options.error ?? undefined } }));
  if (options.usedTool !== false) db.prepare("INSERT INTO part(message_id,data) VALUES(?,?)").run(messageId, JSON.stringify({ type: "tool" }));
  db.close();
}

function poll(sync: AgentSessionSync, emit = true): void {
  (sync as unknown as { poll(emit: boolean): void }).poll(emit);
}

describe("Agent-Session-Synchronisation", () => {
  it("ignoriert T3-interne OpenCode-Abschlüsse, meldet normale OpenCode-Läufe aber nach Abschluss", () => {
    const { opencodePath, notifications, sync } = fixture();
    const db = new DatabaseSync(opencodePath);
    db.prepare("INSERT INTO session VALUES(?,?,?,?,?,?)").run("t3-prefix-session", "/workspace", " t3 code generateThreadTitle ", 0, null, 0);
    db.prepare("INSERT INTO session VALUES(?,?,?,?,?,?)").run("t3-task-session", "/workspace", "Planung Skill-Editor-Tool für Coding-Agents", 0, null, 0);
    db.prepare("INSERT INTO session VALUES(?,?,?,?,?,?)").run("normal-session", "/home/bbecker/projects/anderes", "Feature umsetzen", 0, null, 0);
    db.close();

    sync.start();
    appendAssistantCompletion(opencodePath, "t3-prefix-session", "t3-prefix-message");
    appendAssistantCompletion(opencodePath, "t3-task-session", "t3-task-message");
    appendAssistantCompletion(opencodePath, "normal-session", "normal-message");
    poll(sync);

    expect(notifications.list().notifications).toHaveLength(1);
    expect(notifications.list().notifications[0]).toMatchObject({ source: "opencode", kind: "agent.completed", remoteId: "opencode:run:normal-session:45000" });
    sync.stop();
    notifications.close();
  });

  it("erkennt T3-interne Sessions am aktiven T3-Projektverzeichnis, auch ohne Titelmarker", () => {
    const { opencodePath, notifications, sync } = fixture();
    // T3-Titel weichen ab oder die Session wurde nachträglich umbenannt; der
    // laufende T3-Thread im selben Verzeichnis bleibt das entscheidende Signal.
    addSession(opencodePath, "t3-directory-session", { title: "Irgendein Auto-Titel", directory: "/workspace", timeCreated: Date.now() });
    addSession(opencodePath, "t3-subagent", { title: "Recherche (@explore subagent)", directory: "/workspace", parentId: "t3-directory-session", timeCreated: Date.now() });
    addSession(opencodePath, "manuell", { title: "Handarbeit", directory: "/home/bbecker/projects/anderes", timeCreated: Date.now() });
    appendAssistantCompletion(opencodePath, "t3-directory-session", "m1");
    appendAssistantCompletion(opencodePath, "t3-subagent", "m2");
    appendAssistantCompletion(opencodePath, "manuell", "m3");
    poll(sync);
    const entries = notificationsList(notifications);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.remoteId).toContain("manuell");
    sync.stop();
    notifications.close();
  });

  it("bündelt viele Assistant-Nachrichten eines Laufs zu genau einer Meldung", () => {
    const { opencodePath, notifications, sync } = fixture();
    addSession(opencodePath, "lauf", { directory: "/home/bbecker/projects/anderes" });
    for (let index = 0; index < 5; index += 1) appendAssistantCompletion(opencodePath, "lauf", `msg-${index}`, 10_000 + index * 1_000, { created: index * 1_000 });
    poll(sync);
    const entries = notificationsList(notifications);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "agent.completed", remoteId: "opencode:run:lauf:14000" });
    expect(entries[0]?.meta.responses).toBe(5);
    sync.stop();
    notifications.close();
  });

  it("meldet Subagenten-Nachrichten im Hauptlauf statt als eigene Meldungen", () => {
    const { opencodePath, notifications, sync } = fixture();
    addSession(opencodePath, "haupt", { directory: "/home/bbecker/projects/anderes" });
    addSession(opencodePath, "sub", { directory: "/home/bbecker/projects/anderes", parentId: "haupt" });
    appendAssistantCompletion(opencodePath, "haupt", "h1");
    appendAssistantCompletion(opencodePath, "sub", "s1");
    appendAssistantCompletion(opencodePath, "sub", "s2");
    poll(sync);
    const entries = notificationsList(notifications);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.meta.sessionId).toBe("haupt");
    expect(entries[0]?.meta.responses).toBe(3);
    sync.stop();
    notifications.close();
  });

  it("startet nach einer Pause einen neuen Lauf mit neuer Meldung", () => {
    const { opencodePath, notifications, sync } = fixture();
    addSession(opencodePath, "lauf", { directory: "/home/bbecker/projects/anderes" });
    appendAssistantCompletion(opencodePath, "lauf", "a1", 10_000, { created: 0 });
    poll(sync);
    expect(notificationsList(notifications)).toHaveLength(1);
    appendAssistantCompletion(opencodePath, "lauf", "a2", 80_000, { created: 70_000 });
    poll(sync);
    const entries = notificationsList(notifications);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.remoteId).not.toBe(entries[1]?.remoteId);
    sync.stop();
    notifications.close();
  });

  it("meldet einen fehlgeschlagenen Lauf als genau eine Fehlermeldung", () => {
    const { opencodePath, notifications, sync } = fixture();
    addSession(opencodePath, "lauf", { directory: "/home/bbecker/projects/anderes" });
    appendAssistantCompletion(opencodePath, "lauf", "ok", 5_000, { created: 0 });
    appendAssistantCompletion(opencodePath, "lauf", "kaputt", 9_000, { created: 6_000, error: "Rate limit exceeded" });
    poll(sync);
    const entries = notificationsList(notifications);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "agent.failed", severity: "error", body: "Rate limit exceeded" });
    expect(entries[0]?.meta.responses).toBe(2);
    sync.stop();
    notifications.close();
  });

  it("verliert keine Abschlüsse jenseits des 500er-Leselimits", () => {
    const { opencodePath, cursorPath, notifications, sync } = fixture({ runIdleSeconds: 90 });
    const now = Date.now();
    addSession(opencodePath, "lauf", { directory: "/home/bbecker/projects/anderes", timeCreated: now, timeUpdated: now });
    for (let index = 0; index < 600; index += 1) appendAssistantCompletion(opencodePath, "lauf", `msg-${index}`, index * 1_000 + 1_000, { created: index * 1_000 });
    // Der erste Poll liest 500 Ereignisse, der zweite den Rest. Der Cursor
    // springt nie über ungelesene Zeilen hinweg.
    poll(sync);
    expect(JSON.parse(readFileSync(cursorPath, "utf8"))).toMatchObject({ opencodeRowId: 500 });
    poll(sync);
    expect(JSON.parse(readFileSync(cursorPath, "utf8"))).toMatchObject({ opencodeRowId: 600 });
    expect(notificationsList(notifications)).toEqual([]);
    const db = new DatabaseSync(opencodePath);
    db.prepare("UPDATE session SET time_updated=? WHERE id='lauf'").run(now - 120_000);
    db.close();
    poll(sync);
    const entries = notificationsList(notifications);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.meta.responses).toBe(600);
    sync.stop();
    notifications.close();
  });

  it("bündelt auch bei aktiv weiterlaufender Session erst nach der Ruhepause", () => {
    const { opencodePath, notifications, sync } = fixture({ runIdleSeconds: 90 });
    const now = Date.now();
    addSession(opencodePath, "lauf", { directory: "/home/bbecker/projects/anderes", timeCreated: now, timeUpdated: now });
    appendAssistantCompletion(opencodePath, "lauf", "m1", 5_000, { created: 0 });
    poll(sync);
    expect(notificationsList(notifications)).toEqual([]);
    const db = new DatabaseSync(opencodePath);
    db.prepare("UPDATE session SET time_updated=? WHERE id='lauf'").run(now - 90_000);
    db.close();
    poll(sync);
    expect(notificationsList(notifications)).toHaveLength(1);
    sync.stop();
    notifications.close();
  });

  it("hält den Lauf offen, solange ein Subagent noch arbeitet", () => {
    const { opencodePath, notifications, sync } = fixture({ runIdleSeconds: 90 });
    const now = Date.now();
    addSession(opencodePath, "haupt", { directory: "/home/bbecker/projects/anderes", timeCreated: now - 300_000, timeUpdated: now - 300_000 });
    addSession(opencodePath, "sub", { directory: "/home/bbecker/projects/anderes", parentId: "haupt", timeCreated: now - 300_000, timeUpdated: now });
    appendAssistantCompletion(opencodePath, "haupt", "h1", 1_000, { created: 0 });
    appendAssistantCompletion(opencodePath, "sub", "s1", 2_000, { created: 1_000 });
    poll(sync);
    expect(notificationsList(notifications)).toEqual([]);
    const db = new DatabaseSync(opencodePath);
    db.prepare("UPDATE session SET time_updated=? WHERE id='sub'").run(now - 120_000);
    db.close();
    poll(sync);
    expect(notificationsList(notifications)).toHaveLength(1);
    sync.stop();
    notifications.close();
  });

  it("erkennt T3-Sessions auch, wenn der Turn gerade beendet wurde", () => {
    const { opencodePath, t3Path, notifications, sync } = fixture();
    const t3 = new DatabaseSync(t3Path);
    t3.prepare("UPDATE projection_turns SET state='completed', completed_at=? WHERE row_id=1").run(new Date().toISOString());
    t3.prepare("UPDATE projection_thread_sessions SET status='stopped'").run();
    t3.close();
    addSession(opencodePath, "t3-kurz", { title: "Umbenannter Thread", directory: "/workspace", timeCreated: Date.now() });
    appendAssistantCompletion(opencodePath, "t3-kurz", "kurz-1");
    poll(sync);
    expect(notificationsList(notifications)).toEqual([]);
    sync.stop();
    notifications.close();
  });

  it("ordnet nur Sessions im Zeitfenster des aktiven T3-Turns zu", () => {
    const now = Date.now();
    expect(matchesT3Directory({ directory: "/workspace", timeCreated: now }, { directory: "/workspace", activeSince: now })).toBe(true);
    // Ein seit Stunden offener T3-Thread darf neue manuelle Läufe nicht schlucken.
    expect(matchesT3Directory({ directory: "/workspace", timeCreated: now }, { directory: "/workspace", activeSince: now - 3 * 3_600_000 })).toBe(false);
    expect(matchesT3Directory({ directory: "/workspace", timeCreated: now - 60_000 }, { directory: "/workspace", activeSince: now })).toBe(true);
  });

  it("setzt beim ersten Lauf nur den Cursor und erzeugt keine Toast-Kandidaten für den Bestand", () => {
    const { opencodePath, cursorPath, notifications, sync } = fixture();
    addSession(opencodePath, "normal-session", { directory: "/home/bbecker/projects/anderes" });
    appendAssistantCompletion(opencodePath, "normal-session", "old-message");

    sync.start();
    expect(notifications.list().notifications).toEqual([]);
    expect(JSON.parse(readFileSync(cursorPath, "utf8"))).toMatchObject({ opencodeRowId: 1 });
    sync.stop();
    notifications.close();
  });
});

function notificationsList(database: NotificationDatabase) {
  return database.list({ limit: 100 }).notifications;
}
