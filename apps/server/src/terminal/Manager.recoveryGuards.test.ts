import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalDatabase } from "./database.js";
import { TerminalManager } from "./Manager.js";
import type { PtyProcess } from "./NodePtyAdapter.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { RESPAWN_DELAYS_MS } from "./recovery.js";
import type { TmuxSupervisor } from "./TmuxSupervisor.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
});

class FakePty implements PtyProcess {
  pid = 0;
  readonly writes: string[] = [];
  readonly resizes: Array<[number, number]> = [];
  private data: ((data: string) => void) | undefined;
  private exit: ((event: { exitCode: number; signal?: number }) => void) | undefined;
  write(data: string) { this.writes.push(data); }
  resize(cols: number, rows: number) { this.resizes.push([cols, rows]); }
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
  captureValue = "";
  respawnGate: Promise<void> | null = null;

  sessionName(runtimeId: string) { return `wrapt-${runtimeId.replaceAll("-", "")}`; }
  scan() {
    return {
      available: true,
      sessions: [...this.sessions].map((name) => {
        const dead = this.dead.get(name);
        return {
          name, runtimeId: null, kind: "shell" as const, projectId: null, cwd: "/tmp", command: "bash",
          createdAt: 0, managed: true, dead: dead !== undefined,
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
    const name = input.supervisorName ?? this.sessionName(input.runtimeId);
    this.sessions.add(name);
    this.dead.delete(name);
    return name;
  }
  capture() { return this.captureValue; }
  attachCommand(name: string) { return { file: "/usr/bin/tmux", args: ["attach-session", "-t", name] }; }
  async respawn(name: string) { this.sessions.add(name); this.dead.delete(name); }
  async respawnWithStatus(name: string) {
    if (this.respawnGate) await this.respawnGate;
    const existed = this.sessions.has(name);
    this.sessions.add(name);
    this.dead.delete(name);
    return { name, created: !existed };
  }
  currentPath() { return null; }
  terminate(name: string) { this.terminated.push(name); this.sessions.delete(name); this.dead.delete(name); }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(overrides: { database?: TerminalDatabase; externalSessionOwnerId?: string; spawn?: () => PtyProcess } = {}) {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-guards-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const supervisor = new FakeSupervisor();
  const ptys: FakePty[] = [];
  const manager = new TerminalManager({
    allowedRoots: [root], defaultCwd: root, maxSessions: 2,
    supervisor: supervisor as unknown as TmuxSupervisor,
    adapter: { spawn: overrides.spawn ?? (() => { const pty = new FakePty(); ptys.push(pty); return pty; }) },
    ...(overrides.database ? { database: overrides.database } : {}),
    ...(overrides.externalSessionOwnerId ? { externalSessionOwnerId: overrides.externalSessionOwnerId } : {}),
  });
  cleanup.push(() => manager.shutdown());
  return { root, supervisor, ptys, manager };
}

function databaseFor(root: string) {
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(() => database.close());
  return database;
}

test("schickt nach einem Backend-Neustart einen Snapshot statt leerer Deltas", async () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-restart-epoch-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const database = databaseFor(root);
  const supervisor = new FakeSupervisor();
  supervisor.captureValue = "__CAPTURE_NACH_NEUSTART__\n";
  const options = {
    allowedRoots: [root], defaultCwd: root, maxSessions: 2, database,
    supervisor: supervisor as unknown as TmuxSupervisor,
    adapter: { spawn: () => new FakePty() },
  };
  const first = new TerminalManager(options);
  cleanup.push(() => first.shutdown());
  const session = await first.createSession("owner", { cols: 80, rows: 24 });
  await first.shutdown();
  // Die Pane lebt weiter; der neue Manager hat aber keinen Headless-Zustand.
  expect(supervisor.sessions.has(session.supervisorName!)).toBe(true);

  const second = new TerminalManager(options);
  cleanup.push(() => second.shutdown());
  await second.ready();
  const received: ServerTerminalMessage[] = [];
  const detach = await second.attachSession("owner", session.id, (message) => received.push(message), "resume", undefined, { epoch: 0, lastSequence: 1 });

  await vi.waitFor(() => expect(received.some((message) => message.type === "terminal.snapshot")).toBe(true));
  const snapshot = received.find((message) => message.type === "terminal.snapshot") as { epoch: number } | undefined;
  expect(snapshot?.epoch).toBe(1);
  await vi.waitFor(() => {
    const content = received.flatMap((message) => {
      if (message.type === "terminal.snapshot") return [message.serialized];
      if (message.type === "terminal.deltas") return message.deltas.map((delta) => delta.data);
      return [];
    }).join("");
    expect(content).toContain("__CAPTURE_NACH_NEUSTART__");
  });
  detach();
});

test("lässt nach einem Close während der Recovery keine Pane und keine Geistersitzung zurück", async () => {
  vi.useFakeTimers();
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-recovery-close-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const database = databaseFor(root);
  const { supervisor, ptys, manager } = setup({ database, externalSessionOwnerId: "owner", spawn: () => { const pty = new FakePty(); ptys.push(pty); return pty; } });
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  const name = session.supervisorName!;

  supervisor.dead.set(name, { exitCode: 7, exitSignal: null });
  const gate = deferred();
  supervisor.respawnGate = gate.promise;
  ptys[0]!.end(7);
  await vi.advanceTimersByTimeAsync(0);
  expect(manager.getSessionMetadata("owner", session.id).status).toBe("starting");

  await vi.advanceTimersByTimeAsync(RESPAWN_DELAYS_MS[0]);
  await manager.closeSession("owner", session.id);
  expect(supervisor.sessions.has(name)).toBe(false);

  gate.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(supervisor.sessions.has(name)).toBe(false);
  expect(supervisor.terminated).toContain(name);
  await manager.listSessions("owner");
  expect(database.listSessions("owner", () => 0)).toEqual([]);
});

test("nimmt Eingaben über activateClient im starting-Zustand an und schreibt sie nach dem Attach", async () => {
  vi.useFakeTimers();
  const { supervisor, ptys, manager } = setup();
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  const detach = await manager.attachSession("owner", session.id, () => {}, "tester");
  supervisor.dead.set(session.supervisorName!, { exitCode: 1, exitSignal: null });

  ptys[0]!.end(1);
  await vi.advanceTimersByTimeAsync(0);
  expect(manager.getSessionMetadata("owner", session.id).status).toBe("starting");

  expect(() => manager.activateClient("owner", session.id, "tester")).not.toThrow();
  expect(() => manager.takeControl("owner", session.id, "tester")).not.toThrow();
  expect(() => manager.resizeSession("owner", session.id, 90, 25, "tester")).not.toThrow();
  manager.writeToSession("owner", session.id, "weiter\r");

  await vi.advanceTimersByTimeAsync(RESPAWN_DELAYS_MS[0]);
  expect(ptys).toHaveLength(2);
  expect(ptys[1]!.writes).toEqual(["weiter\r"]);
  expect(manager.getSessionMetadata("owner", session.id)).toMatchObject({ status: "running", cols: 90, rows: 25 });
  detach();
});

test("beendet einen manuellen Neustart mit Spawn-Fehler als interrupted statt dauerhaft starting", async () => {
  let failSpawn = false;
  const { ptys, manager } = setup({
    spawn: () => {
      if (failSpawn) throw new Error("spawn kaputt");
      const pty = new FakePty();
      ptys.push(pty);
      return pty;
    },
  });
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  expect(session.status).toBe("running");

  failSpawn = true;
  await expect(manager.restartSession("owner", session.id)).rejects.toMatchObject({ code: "PTY_SPAWN_FAILED" });
  expect(manager.getSessionMetadata("owner", session.id).status).toBe("interrupted");
});
