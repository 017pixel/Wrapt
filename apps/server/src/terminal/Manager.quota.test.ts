import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { TerminalDatabase, type StoredTerminalSession } from "./database.js";
import { TerminalManager } from "./Manager.js";
import { STALE_SESSION_TTL_MS } from "./session.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); });

class FakeSupervisor {
  readonly sessions = new Set<string>();
  sessionName(runtimeId: string) { return `wrapt-${runtimeId.replaceAll("-", "")}`; }
  list() { return [...this.sessions].map((name) => ({ name })); }
  has(name: string) { return this.sessions.has(name); }
  ensure(input: { runtimeId: string }) { const name = this.sessionName(input.runtimeId); this.sessions.add(name); return name; }
  capture() { return ""; }
  attachCommand(name: string) { return { file: "/usr/bin/tmux", args: ["attach-session", "-t", name] }; }
  respawn(name: string) { this.sessions.add(name); }
  sendLastCommandHint() {}
  currentPath() { return null; }
  terminate(name: string) { this.sessions.delete(name); }
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-quota-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(() => database.close());
  return { root, database };
}

function stored(root: string, overrides: Partial<StoredTerminalSession>): StoredTerminalSession {
  const now = Date.now();
  return {
    id: randomUUID(), userId: "owner", runtimeId: randomUUID(), kind: "shell", mode: "agent",
    projectId: null, profilePath: null, supervisorName: null, cwd: root, pid: 0, cols: 80, rows: 24,
    status: "interrupted", createdAt: now, updatedAt: now, exitCode: null, exitSignal: null, epoch: 0,
    ...overrides,
  };
}

function managerWith(root: string, database: TerminalDatabase, supervisor: FakeSupervisor, maxSessions = 1) {
  const manager = new TerminalManager({
    allowedRoots: [root], defaultCwd: root, maxSessions, database,
    supervisor: supervisor as unknown as TmuxSupervisor,
    adapter: { spawn: () => ({ pid: 0, write() {}, resize() {}, kill() {}, onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }) }) },
  });
  cleanup.push(() => manager.shutdown());
  return manager;
}

test("unterbrochene Sitzungen ohne Workspace-Eintrag blockieren keine neuen Terminals", () => {
  const { root, database } = setup();
  // Genau der Produktionszustand: viele unterbrochene Zeilen ohne lebenden
  // Supervisor und ohne Workspace-Eintrag hatten die Gesamtquote belegt.
  for (let index = 0; index < 3; index += 1) {
    database.saveSession(stored(root, { supervisorName: `wrapt-dead-${index}` }));
  }
  const manager = managerWith(root, database, new FakeSupervisor());
  // Die Altlasten bleiben abrufbar (gleiche Runtime-ID), zählen aber nicht
  // mehr als gleichzeitig geöffnete Terminals.
  for (const session of database.listSessions("owner", () => 0)) {
    expect(database.findSession("owner", session.runtimeId)).toBeDefined();
  }
  return expect(manager.createSession("owner", { cols: 80, rows: 24 })).resolves.toMatchObject({ kind: "shell" });
});

test("entfernt alte, unsichtbare Sitzungen beim Start aus der Registry", () => {
  const { root, database } = setup();
  const stale = stored(root, { supervisorName: "wrapt-dead", updatedAt: Date.now() - STALE_SESSION_TTL_MS - 1_000 });
  database.saveSession(stale);
  managerWith(root, database, new FakeSupervisor());
  expect(database.findSession("owner", stale.runtimeId)).toBeUndefined();
});

test("zählt unterbrochene Sitzungen mit Workspace-Eintrag gegen die Quote", () => {
  const { root, database } = setup();
  const session = stored(root, { supervisorName: "wrapt-dead" });
  database.saveSession(session);
  const current = database.getWorkspace("owner");
  database.saveWorkspace("owner", {
    ...current.document,
    entries: [{ id: "entry", runtimeId: session.runtimeId, name: "Terminal", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null }],
  }, 0);
  const manager = managerWith(root, database, new FakeSupervisor());
  expect(database.findSession("owner", session.runtimeId)).toMatchObject({ status: "interrupted" });
  return expect(manager.createSession("owner", { cols: 80, rows: 24 })).rejects.toMatchObject({ code: "TOO_MANY_SESSIONS" });
});

test("zählt laufende Sitzungen mit lebendem Supervisor gegen die Quote", () => {
  const { root, database } = setup();
  const supervisorName = "wrapt-live";
  const session = stored(root, { supervisorName, status: "running" });
  database.saveSession(session);
  const supervisor = new FakeSupervisor();
  supervisor.sessions.add(supervisorName);
  const manager = managerWith(root, database, supervisor);
  expect(database.findSession("owner", session.runtimeId)).toMatchObject({ status: "running" });
  return expect(manager.createSession("owner", { cols: 80, rows: 24 })).rejects.toMatchObject({ code: "TOO_MANY_SESSIONS" });
});

test("zählt unterbrochene Sitzungen mit lebendem Supervisor gegen die Quote", () => {
  const { root, database } = setup();
  const supervisorName = "wrapt-live-interrupted";
  const session = stored(root, { supervisorName, status: "interrupted" });
  database.saveSession(session);
  const supervisor = new FakeSupervisor();
  supervisor.sessions.add(supervisorName);
  const manager = managerWith(root, database, supervisor);
  return expect(manager.createSession("owner", { cols: 80, rows: 24 })).rejects.toMatchObject({ code: "TOO_MANY_SESSIONS" });
});

test("behält alte Workspace-Einträge und lebende Supervisor-Sitzungen beim Aufräumen", () => {
  const { root, database } = setup();
  const old = Date.now() - STALE_SESSION_TTL_MS - 1_000;
  const referenced = stored(root, { updatedAt: old });
  const supervised = stored(root, { updatedAt: old, supervisorName: "wrapt-live-old" });
  database.saveSession(referenced);
  database.saveSession(supervised);
  const current = database.getWorkspace("owner");
  database.saveWorkspace("owner", {
    ...current.document,
    entries: [{ id: "entry", runtimeId: referenced.runtimeId, name: "Terminal", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null }],
  }, 0);
  const supervisor = new FakeSupervisor();
  supervisor.sessions.add("wrapt-live-old");
  managerWith(root, database, supervisor);
  expect(database.findSession("owner", referenced.runtimeId)).toBeDefined();
  expect(database.findSession("owner", supervised.runtimeId)).toBeDefined();
});

test("verwirft keine Sitzungen, wenn das Workspace-Dokument defekt ist", () => {
  const { root, database } = setup();
  const stale = stored(root, { updatedAt: Date.now() - STALE_SESSION_TTL_MS - 1_000 });
  database.saveSession(stale);
  const internal = database as unknown as { db: { prepare: (sql: string) => { run: (...params: (string | number)[]) => void } } };
  internal.db.prepare("INSERT INTO terminal_workspaces(owner_id, document_json, revision, updated_at) VALUES (?, ?, ?, ?)").run(
    "owner", "{ kaputt", 1, new Date().toISOString(),
  );
  managerWith(root, database, new FakeSupervisor());
  expect(database.findSession("owner", stale.runtimeId)).toBeDefined();
});
