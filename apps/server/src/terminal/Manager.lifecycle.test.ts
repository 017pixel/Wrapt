import { mkdtempSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalDatabase, type StoredTerminalSession } from "./database.js";
import { TerminalManager } from "./Manager.js";
import type { PtyProcess } from "./NodePtyAdapter.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { STALE_SESSION_TTL_MS } from "./session.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });

class FakePty implements PtyProcess {
  pid = 0;
  readonly writes: string[] = [];
  private data: ((data: string) => void) | undefined;
  private exit: ((event: { exitCode: number; signal?: number }) => void) | undefined;
  write(data: string) { this.writes.push(data); }
  resize() {}
  kill() {}
  onData(callback: (data: string) => void) { this.data = callback; return { dispose: () => { this.data = undefined; } }; }
  onExit(callback: (event: { exitCode: number; signal?: number }) => void) { this.exit = callback; return { dispose: () => { this.exit = undefined; } }; }
  output(data: string) { this.data?.(data); }
  end(exitCode = 0, signal?: number) { this.exit?.({ exitCode, ...(signal === undefined ? {} : { signal }) }); }
}

class FakeSupervisor {
  readonly sessions = new Set<string>();
  readonly dead = new Map<string, { exitCode: number; exitSignal: number | null }>();
  readonly terminated: string[] = [];
  ensureCalls = 0;
  scanError = false;
  unavailable = false;
  terminateFailures = 0;

  sessionName(runtimeId: string) { return `wrapt-${runtimeId.replaceAll("-", "")}`; }
  scan() {
    if (this.scanError) throw new Error("tmux-Scan fehlgeschlagen");
    if (this.unavailable) return { available: false, sessions: [] };
    return {
      available: true,
      sessions: [...this.sessions].map((name) => {
        const dead = this.dead.get(name);
        return {
          name, managed: true, dead: dead !== undefined,
          exitCode: dead?.exitCode ?? null, exitSignal: dead?.exitSignal ?? null,
        };
      }),
    };
  }
  paneStatus(name: string) {
    if (!this.sessions.has(name)) return { state: "missing" as const, exitCode: null };
    const dead = this.dead.get(name);
    if (!dead) return { state: "alive" as const, exitCode: null };
    return { state: "dead" as const, exitCode: dead.exitCode, ...(dead.exitSignal ? { exitSignal: dead.exitSignal } : {}) };
  }
  list() { return [...this.sessions].map((name) => ({ name })); }
  has(name: string) { return this.sessions.has(name); }
  ensure(input: { runtimeId: string; supervisorName?: string | null }) {
    this.ensureCalls += 1;
    const name = input.supervisorName ?? this.sessionName(input.runtimeId);
    this.sessions.add(name);
    this.dead.delete(name);
    return name;
  }
  capture() { return ""; }
  attachCommand(name: string) { return { file: "/usr/bin/tmux", args: ["attach-session", "-t", name] }; }
  respawn(name: string) { this.sessions.add(name); this.dead.delete(name); }
  currentPath() { return null; }
  terminate(name: string) {
    this.terminated.push(name);
    if (this.terminateFailures > 0) { this.terminateFailures -= 1; throw new Error("tmux nicht erreichbar"); }
    this.sessions.delete(name);
    this.dead.delete(name);
  }
}

function setup(prefix: string) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(() => database.close());
  const supervisor = new FakeSupervisor();
  return { root, database, supervisor };
}

function managerFor(root: string, database: TerminalDatabase, supervisor: FakeSupervisor, overrides: { maxSessions?: number } = {}) {
  const manager = new TerminalManager({
    allowedRoots: [root], defaultCwd: root, maxSessions: overrides.maxSessions ?? 2,
    database, supervisor: supervisor as unknown as TmuxSupervisor,
    adapter: { spawn: () => new FakePty() },
  });
  cleanup.push(() => manager.shutdown());
  return manager;
}

function stored(root: string, overrides: Partial<StoredTerminalSession>): StoredTerminalSession {
  const now = Date.now();
  return {
    id: randomUUID(), userId: "owner", runtimeId: randomUUID(), kind: "shell", mode: "agent",
    projectId: null, profilePath: null, supervisorName: null, cwd: root, pid: 0, cols: 80, rows: 24,
    status: "running", createdAt: now, updatedAt: now, exitCode: null, exitSignal: null, epoch: 0,
    ...overrides,
  };
}

test("verbindet nach einem Backend-Neustart auch ohne has() über den Pane-Zustand", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-attach-");
  const first = managerFor(root, database, supervisor);
  const session = await first.createSession("owner", { cols: 80, rows: 24 });
  await first.shutdown();
  // Die Unterlage ist verschwunden; has() wäre false und darf das Recovery
  // nicht mehr blockieren.
  supervisor.sessions.clear();
  supervisor.dead.clear();

  const second = managerFor(root, database, supervisor);
  await second.ready();
  expect(database.findSessionById("owner", session.id)?.status).toBe("interrupted");
  const messages: ServerTerminalMessage[] = [];
  const detach = await second.attachSession("owner", session.id, (message) => messages.push(message), "resume", { cols: 100, rows: 30 });
  expect(second.getSessionMetadata("owner", session.id)).toMatchObject({ status: "running", cols: 100, rows: 30 });
  expect(messages.some((message) => message.type === "terminal.snapshot")).toBe(true);
  detach();
});

test("teilt sich bei parallelen Attaches genau eine Recovery", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-race-");
  const first = managerFor(root, database, supervisor);
  const session = await first.createSession("owner", { cols: 80, rows: 24 });
  await first.shutdown();
  supervisor.ensureCalls = 0;

  const second = managerFor(root, database, supervisor);
  await second.ready();
  const detachA = second.attachSession("owner", session.id, () => {}, "a");
  const detachB = second.attachSession("owner", session.id, () => {}, "b");
  const [releaseA, releaseB] = await Promise.all([detachA, detachB]);
  expect(supervisor.ensureCalls).toBe(1);
  expect(second.getSessionMetadata("owner", session.id).status).toBe("running");
  releaseA();
  releaseB();
});

test("räumt einen Close auch bei fehlgeschlagenem terminate auf und holt ihn nach", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-close-");
  const manager = managerFor(root, database, supervisor);
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  const supervisorName = session.supervisorName!;
  supervisor.terminateFailures = 2;

  await manager.closeSession("owner", session.id);
  expect(database.findSessionById("owner", session.id)).toBeUndefined();
  expect(() => manager.getSessionMetadata("owner", session.id)).toThrowError(/nicht gefunden/);
  expect(supervisor.sessions.has(supervisorName)).toBe(true);

  // Ein weiterhin fehlschlagender Retry darf die Pane nicht als neue Session
  // importieren. Erst der nächste erfolgreiche Lauf räumt sie weg.
  await manager.listSessions("owner");
  expect(database.findSessionById("owner", session.id)).toBeUndefined();
  expect(database.listSessions("owner", () => 0)).toEqual([]);
  await manager.listSessions("owner");
  expect(supervisor.sessions.has(supervisorName)).toBe(false);
  expect(supervisor.terminated.filter((name) => name === supervisorName)).toHaveLength(3);
});

test("Scanfehler ändern und löschen beim Start nichts", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-scanerror-");
  const old = Date.now() - STALE_SESSION_TTL_MS - 1_000;
  const running = stored(root, { supervisorName: "wrapt-live", updatedAt: old });
  database.saveSession(running);
  supervisor.scanError = true;

  const manager = managerFor(root, database, supervisor);
  await manager.ready();
  expect(database.findSessionById("owner", running.id)).toMatchObject({ status: "running", supervisorName: "wrapt-live" });
});

test("ein nicht verfügbarer Scan gilt ebenfalls als unverändert", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-scanunavailable-");
  const running = stored(root, { supervisorName: "wrapt-live" });
  database.saveSession(running);
  supervisor.unavailable = true;

  const manager = managerFor(root, database, supervisor);
  await manager.ready();
  expect(database.findSessionById("owner", running.id)).toMatchObject({ status: "running" });
});

test("tote Panes werden beendet und belegen keine Quote", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-dead-");
  const clean = stored(root, { supervisorName: "wrapt-dead-clean" });
  const crashed = stored(root, { supervisorName: "wrapt-dead-crash" });
  database.saveSession(clean);
  database.saveSession(crashed);
  supervisor.sessions.add("wrapt-dead-clean");
  supervisor.sessions.add("wrapt-dead-crash");
  supervisor.dead.set("wrapt-dead-clean", { exitCode: 0, exitSignal: null });
  supervisor.dead.set("wrapt-dead-crash", { exitCode: 3, exitSignal: null });

  const manager = managerFor(root, database, supervisor, { maxSessions: 1 });
  await manager.ready();
  expect(database.findSessionById("owner", clean.id)).toMatchObject({ status: "exited", exitCode: 0 });
  expect(database.findSessionById("owner", crashed.id)).toMatchObject({ status: "interrupted", exitCode: 3 });
  await expect(manager.createSession("owner", { cols: 80, rows: 24 })).resolves.toMatchObject({ status: "running" });
});

test("nimmt Eingaben während des automatischen Respawns an und schreibt sie nach dem Attach", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-input-");
  const ptys = [new FakePty(), new FakePty()];
  let spawnIndex = 0;
  const manager = new TerminalManager({
    allowedRoots: [root], defaultCwd: root, maxSessions: 1,
    database, supervisor: supervisor as unknown as TmuxSupervisor,
    adapter: { spawn: () => ptys[spawnIndex++]! },
  });
  cleanup.push(() => manager.shutdown());
  vi.useFakeTimers();
  try {
    const session = await manager.createSession("owner", { cols: 80, rows: 24 });
    const supervisorName = session.supervisorName!;
    supervisor.dead.set(supervisorName, { exitCode: 1, exitSignal: null });
    ptys[0]!.end(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(manager.getSessionMetadata("owner", session.id).status).toBe("starting");

    manager.writeToSession("owner", session.id, "weiter\r");
    await vi.advanceTimersByTimeAsync(1_000);

    expect(spawnIndex).toBe(2);
    expect(ptys[1]!.writes).toEqual(["weiter\r"]);
    expect(manager.getSessionMetadata("owner", session.id).status).toBe("running");
  } finally {
    vi.useRealTimers();
  }
});

test("ein entfernter Workspace-Eintrag beendet seine Sitzung über den Lifecycle", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-workspace-");
  const manager = managerFor(root, database, supervisor);
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  const entry = {
    id: "entry-1", runtimeId: session.runtimeId, name: "Terminal", parentFolderId: null,
    sortOrder: 0, pinned: false, persistent: false, kind: "shell" as const, projectId: null, initialCwd: null,
  };
  const current = database.getWorkspace("owner");
  database.saveWorkspace("owner", { ...current.document, entries: [entry] }, 0);
  await manager.drainLifecycleCleanups();
  expect(database.findSessionById("owner", session.id)).toBeDefined();

  database.saveWorkspace("owner", { ...current.document, entries: [] }, 1);
  await manager.drainLifecycleCleanups();
  expect(database.findSessionById("owner", session.id)).toBeUndefined();
  expect(() => manager.getSessionMetadata("owner", session.id)).toThrowError(/nicht gefunden/);
});

test("räumt beendete Sessions nach Ablauf der TTL auf, statt den Slot zu blockieren", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-ttl-");
  const ptys = [new FakePty(), new FakePty()];
  let spawnIndex = 0;
  const manager = new TerminalManager({
    allowedRoots: [root], defaultCwd: root, maxSessions: 1, database,
    supervisor: supervisor as unknown as TmuxSupervisor,
    adapter: { spawn: () => ptys[spawnIndex++]! },
  });
  cleanup.push(() => manager.shutdown());
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  supervisor.dead.set(session.supervisorName!, { exitCode: 0, exitSignal: null });
  ptys[0]!.end(0);
  await vi.waitFor(() => expect(manager.getSessionMetadata("owner", session.id).status).toBe("exited"));
  (session as unknown as { updatedAt: number }).updatedAt = Date.now() - 31 * 60 * 1_000;

  const replacement = await manager.createSession("owner", { cols: 80, rows: 24 });
  expect(replacement.id).not.toBe(session.id);
  expect(() => manager.getSessionMetadata("owner", session.id)).toThrowError(/nicht gefunden/);
});

test("cacht den tmux-Scan und invalidiert ihn bei einem ausdrücklichen Refresh", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-cache-");
  let scans = 0;
  const original = supervisor.list.bind(supervisor);
  supervisor.list = () => { scans += 1; return original(); };
  const manager = new TerminalManager({
    allowedRoots: [root], defaultCwd: root, maxSessions: 1, externalSessionOwnerId: "owner", database,
    supervisor: supervisor as unknown as TmuxSupervisor,
    adapter: { spawn: () => new FakePty() },
  });
  cleanup.push(() => manager.shutdown());
  await manager.listSessions("owner");
  const baseline = scans;
  await manager.listSessions("owner");
  expect(scans).toBe(baseline);
  await manager.listSessions("owner", true);
  expect(scans).toBe(baseline + 1);
});

test("invalidiert den Scan-Cache nach erfolgreichem Retry-Terminate gegen Geisterimporte", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-ghost-");
  const manager = new TerminalManager({
    allowedRoots: [root], defaultCwd: root, maxSessions: 1, database, externalSessionOwnerId: "owner",
    supervisor: supervisor as unknown as TmuxSupervisor,
    adapter: { spawn: () => new FakePty() },
  });
  cleanup.push(() => manager.shutdown());
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  const supervisorName = session.supervisorName!;
  supervisor.terminateFailures = 2;
  await manager.closeSession("owner", session.id);
  expect(supervisor.sessions.has(supervisorName)).toBe(true);

  // Der erste Retry scheitert; der Scan landet mit der noch lebenden Pane im Cache.
  await manager.listSessions("owner");
  expect(database.listSessions("owner", () => 0)).toEqual([]);
  // Der zweite Retry löscht die Pane. Der Cache darf sie nicht mehr liefern.
  await manager.listSessions("owner");
  expect(supervisor.sessions.has(supervisorName)).toBe(false);
  expect(database.listSessions("owner", () => 0)).toEqual([]);
});

test("räumt auch dann auf, wenn ein Client beim Close wirft", async () => {
  const { root, database, supervisor } = setup("wrapt-lifecycle-badclient-");
  const manager = managerFor(root, database, supervisor);
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  await manager.attachSession("owner", session.id, (message) => {
    if (message.type === "terminal.exited") throw new Error("Client weg");
  }, "broken");
  await manager.closeSession("owner", session.id);
  expect(database.findSessionById("owner", session.id)).toBeUndefined();
});
