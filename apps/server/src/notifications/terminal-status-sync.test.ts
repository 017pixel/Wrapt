import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationDatabase } from "./database.js";
import { TerminalStatusSync } from "./terminal-status-sync.js";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

function session(id: string, kind: "codex" | "opencode" = "codex") {
  return { id, kind, projectId: "project-1", cwd: "/srv/workbench", createdAt: Date.now() };
}

function terminalFixture(overrides: { status?: string; exitCode?: number | null; kind?: string } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "wrapt-terminal-sync-"));
  directories.push(directory);
  const databasePath = join(directory, "wrapt.sqlite");
  const db = new DatabaseSync(databasePath);
  db.exec(`CREATE TABLE terminal_sessions (
    id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, kind TEXT NOT NULL, project_id TEXT, cwd TEXT NOT NULL,
    status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    exit_code INTEGER, exit_signal INTEGER, started_at TEXT, ended_at TEXT)`);
  const now = Date.now();
  db.prepare("INSERT INTO terminal_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
    .run("session-1", "laufzeit-1", overrides.kind ?? "opencode", "project-1", "/srv/workbench", overrides.status ?? "running", now - 300_000, now - 100_000, overrides.exitCode ?? null, null, null, null);
  db.close();
  const notifications = new NotificationDatabase(databasePath);
  const sync = new TerminalStatusSync({ databasePath, notifications, pollSeconds: 5, terminalMinimumSeconds: 5, agentMinimumSeconds: 5, inputIdleMilliseconds: 30 });
  const snapshot = (emit: boolean) => (sync as unknown as { snapshot(emit: boolean): void }).snapshot(emit);
  return { databasePath, notifications, sync, snapshot, now };
}

function setTerminalState(databasePath: string, values: { status: string; exitCode: number | null; updatedAt: number }): void {
  const db = new DatabaseSync(databasePath);
  db.prepare("UPDATE terminal_sessions SET status=?, exit_code=?, updated_at=? WHERE id='session-1'").run(values.status, values.exitCode, values.updatedAt);
  db.close();
}

describe("Terminal-Status-Synchronisation", () => {
  it("meldet Input erst nach einer Schreibpause, nicht sofort", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-terminal-sync-")); directories.push(directory);
    const notifications = new NotificationDatabase(join(directory, "wrapt.sqlite"));
    const sync = new TerminalStatusSync({ databasePath: join(directory, "wrapt.sqlite"), notifications, pollSeconds: 5, terminalMinimumSeconds: 5, agentMinimumSeconds: 5, inputIdleMilliseconds: 30 });
    sync.noteOutput(session("laufzeit-1"), "Do you want to proceed?");
    expect(notifications.list().notifications).toEqual([]);
    await sleep(80);
    const entry = notifications.list().notifications[0];
    expect(entry?.kind).toBe("agent.input-required");
    expect(entry?.title).toBe("Codex braucht Input");
    expect(entry?.body).toBe("workbench");
    sync.stop(); notifications.close();
  });

  it("bricht den Warte-Verdacht ab, wenn der Agent weiterarbeitet", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-terminal-sync-")); directories.push(directory);
    const notifications = new NotificationDatabase(join(directory, "wrapt.sqlite"));
    const sync = new TerminalStatusSync({ databasePath: join(directory, "wrapt.sqlite"), notifications, pollSeconds: 5, terminalMinimumSeconds: 5, agentMinimumSeconds: 5, inputIdleMilliseconds: 30 });
    sync.noteOutput(session("laufzeit-2"), "Do you want to proceed?");
    sync.noteOutput(session("laufzeit-2"), "Arbeitet weiter an der Datei…");
    await sleep(80);
    expect(notifications.list().notifications).toEqual([]);
    sync.stop(); notifications.close();
  });

  it("ignoriert Shell-Ausgaben und erkennt erweiterte Warte-Muster", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-terminal-sync-")); directories.push(directory);
    const notifications = new NotificationDatabase(join(directory, "wrapt.sqlite"));
    const sync = new TerminalStatusSync({ databasePath: join(directory, "wrapt.sqlite"), notifications, pollSeconds: 5, terminalMinimumSeconds: 5, agentMinimumSeconds: 5, inputIdleMilliseconds: 30 });
    sync.noteOutput({ id: "shell-1", kind: "shell", projectId: "project-1", cwd: "/srv/workbench", createdAt: Date.now() }, "Do you want to proceed?");
    sync.noteOutput(session("laufzeit-3"), "Select an option to continue:\n[1] ja\n[2] nein");
    await sleep(80);
    const entries = notifications.list().notifications;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.meta.sessionId).toBe("laufzeit-3");
    sync.stop(); notifications.close();
  });

  it("wertet abgebrochene Läufe nicht als Erfolg", () => {
    const { databasePath, notifications, sync, snapshot, now } = terminalFixture();
    snapshot(false);
    setTerminalState(databasePath, { status: "interrupted", exitCode: null, updatedAt: now });
    snapshot(true);
    expect(notifications.list().notifications).toEqual([]);
    sync.stop(); notifications.close();
  });

  it("meldet manuell geschlossene Läufe ohne Exit-Code nicht", () => {
    const { databasePath, notifications, sync, snapshot, now } = terminalFixture();
    snapshot(false);
    setTerminalState(databasePath, { status: "closed", exitCode: null, updatedAt: now });
    snapshot(true);
    expect(notifications.list().notifications).toEqual([]);
    sync.stop(); notifications.close();
  });

  it("meldet einen geschlossenen Lauf mit Exit-Code 0 als Abschluss", () => {
    const { databasePath, notifications, sync, snapshot, now } = terminalFixture({ kind: "claude" });
    snapshot(false);
    setTerminalState(databasePath, { status: "closed", exitCode: 0, updatedAt: now });
    snapshot(true);
    const entries = notifications.list().notifications;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "agent.completed", severity: "success", source: "claude" });
    sync.stop(); notifications.close();
  });

  it("überlässt OpenCode-Erfolge dem Agenten-Sync und meldet nur Fehler", () => {
    const success = terminalFixture();
    success.snapshot(false);
    setTerminalState(success.databasePath, { status: "exited", exitCode: 0, updatedAt: success.now });
    success.snapshot(true);
    expect(success.notifications.list().notifications).toEqual([]);
    success.sync.stop(); success.notifications.close();

    const failure = terminalFixture();
    failure.snapshot(false);
    setTerminalState(failure.databasePath, { status: "exited", exitCode: 1, updatedAt: failure.now });
    failure.snapshot(true);
    const entries = failure.notifications.list().notifications;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "terminal.failed", severity: "error" });
    failure.sync.stop(); failure.notifications.close();
  });

  it("meldet einen abgebrochenen Lauf nicht erneut nach dem nächsten Poll", () => {
    const { databasePath, notifications, sync, snapshot, now } = terminalFixture();
    snapshot(false);
    setTerminalState(databasePath, { status: "interrupted", exitCode: null, updatedAt: now });
    snapshot(true);
    setTerminalState(databasePath, { status: "interrupted", exitCode: null, updatedAt: now + 5_000 });
    snapshot(true);
    expect(notifications.list().notifications).toEqual([]);
    sync.stop(); notifications.close();
  });

  it("meldet den Abschluss eines Claude-Laufs mit Projektname", async () => {
    const directory = mkdtempSync(join(tmpdir(), "wrapt-terminal-sync-")); directories.push(directory);
    const databasePath = join(directory, "wrapt.sqlite");
    const db = new DatabaseSync(databasePath);
    db.exec(`CREATE TABLE terminal_sessions (
      id TEXT PRIMARY KEY, runtime_id TEXT NOT NULL, kind TEXT NOT NULL, project_id TEXT, cwd TEXT NOT NULL,
      status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      exit_code INTEGER, exit_signal INTEGER, started_at TEXT, ended_at TEXT)`);
    const now = Date.now();
    db.prepare("INSERT INTO terminal_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("session-1", "laufzeit-1", "claude", "project-1", "/srv/workbench", "running", now - 200_000, now - 50_000, null, null, null, null);
    db.close();
    const notifications = new NotificationDatabase(databasePath);
    const sync = new TerminalStatusSync({ databasePath, notifications, pollSeconds: 1, terminalMinimumSeconds: 5, agentMinimumSeconds: 5, inputIdleMilliseconds: 30 });
    // Die Session läuft beim Start: Der erste Poll ist die Baseline, danach
    // wechselt die Session auf exited und der nächste Tick meldet den Lauf.
    sync.start();
    const live = new DatabaseSync(databasePath);
    live.prepare("UPDATE terminal_sessions SET status='exited', exit_code=0, updated_at=? WHERE id='session-1'").run(now - 50_000);
    live.close();
    await sleep(1_200);
    sync.stop();
    const entries = notifications.list().notifications;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.kind).toBe("agent.completed");
    expect(entries[0]?.title).toBe("Claude Code abgeschlossen");
    expect(entries[0]?.body).toBe("workbench · Laufzeit 150 Sekunden");
    notifications.close();
  });
});
