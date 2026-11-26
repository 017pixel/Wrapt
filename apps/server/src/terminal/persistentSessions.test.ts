import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalDatabase } from "./database.js";
import { restorePersistentSessions } from "./persistentSessions.js";
import type { TerminalSession } from "./session.js";
import { TerminalManager } from "./Manager.js";
import { removeTempTree } from "./terminalTestCleanup.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "wrapt-persistent-terminal-"));
  cleanup.push(async () => removeTempTree(root));
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(async () => database.close());
  const spawn = vi.fn(() => ({ pid: 0, write() {}, resize() {}, kill() {}, onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }) }));
  const options = { allowedRoots: [root], defaultCwd: root, maxSessions: 5, database, adapter: { spawn } };
  const first = new TerminalManager(options);
  const persistent = await first.createSession("owner", { cols: 80, rows: 24 });
  const normal = await first.createSession("owner", { cols: 80, rows: 24 });
  const current = database.getWorkspace("owner");
  database.saveWorkspace("owner", { ...current.document, entries: [persistent, normal].map((session, index) => ({ id: `entry-${index}`, runtimeId: session.runtimeId, name: `Terminal ${index}`, parentFolderId: null, sortOrder: index, pinned: false, persistent: index === 0, kind: "shell", projectId: null, initialCwd: null })) }, 0);
  (await first.shutdown());
  spawn.mockClear();
  return { options, database, spawn, persistent, normal };
}

test("startet nur ausdrücklich persistente Terminals erlaubter Nutzer automatisch neu", async () => {
  const { options, database, spawn, persistent, normal } = await setup();
  const current = database.getWorkspace("owner");
  database.saveWorkspace("owner", { ...current.document, entries: [...current.document.entries, { ...current.document.entries[0]!, id: "duplicate-reference" }] }, current.revision);
  const restored = new TerminalManager({ ...options, persistentSessionOwners: ["owner"] });
  await restored.ready();
  cleanup.push(async () => restored.shutdown());
  expect(spawn).toHaveBeenCalledOnce();
  // Der Manager legt das Arbeitsverzeichnis über den echten Pfad an. Auf macOS
  // ist `/var` ein Symlink auf `/private/var`, deshalb `tmpdir()` allein nicht.
  expect(restored.getSessionMetadata("owner", persistent.id)).toMatchObject({ status: "running", epoch: 1, cwd: realpathSync(options.defaultCwd) });
  expect(database.findSessionById("owner", normal.id)?.status).toBe("interrupted");
  expect(database.getWorkspace("owner").document.entries[0]).toMatchObject({ name: "Terminal 0", persistent: true });
});

test("startet keine persistenten Terminals fremder Nutzer", async () => {
  const { options, spawn } = await setup();
  const restored = new TerminalManager({ ...options, persistentSessionOwners: ["another-owner"] });
  await restored.ready();
  cleanup.push(async () => restored.shutdown());
  expect(spawn).not.toHaveBeenCalled();
});

test("lässt einen nicht mehr erlaubten Arbeitsordner unterbrochen", async () => {
  const { options, database, spawn, persistent } = await setup();
  const stored = database.findSessionById("owner", persistent.id)!;
  database.saveSession({ ...stored, cwd: "/" });
  const restored = new TerminalManager({ ...options, persistentSessionOwners: ["owner"] });
  await restored.ready();
  cleanup.push(async () => restored.shutdown());
  expect(spawn).not.toHaveBeenCalled();
  expect(database.findSessionById("owner", persistent.id)?.status).toBe("interrupted");
});

test("begrenzt parallele Neustarts persistenter Sitzungen", async () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-persistent-parallel-"));
  cleanup.push(async () => removeTempTree(root));
  const now = Date.now();
  const rows = Array.from({ length: 5 }, () => ({
    id: randomUUID(), userId: "owner", runtimeId: randomUUID(), kind: "shell" as const, mode: "agent" as const,
    projectId: null, profilePath: null, supervisorName: null, cwd: root, pid: 0, cols: 80, rows: 24,
    status: "interrupted" as const, createdAt: now, updatedAt: now, exitCode: null, exitSignal: null, epoch: 0,
  }));
  const sessions = new Map<string, TerminalSession>();
  let active = 0;
  let maximum = 0;
  let started = 0;
  await restorePersistentSessions({
    database: { persistentSessions: () => rows } as unknown as TerminalDatabase,
    owners: ["owner"],
    allowedRoots: [root],
    sessions,
    spawn: async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await delay(25);
      started += 1;
      active -= 1;
    },
    persist: () => {},
  });
  expect(started).toBe(5);
  expect(sessions.size).toBe(5);
  expect(maximum).toBe(2);
});
