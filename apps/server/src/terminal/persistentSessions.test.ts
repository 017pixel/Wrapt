import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalDatabase } from "./database.js";
import { TerminalManager } from "./Manager.js";
import { removeTempTree } from "./terminalTestCleanup.js";

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose(); });

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "wrapt-persistent-terminal-"));
  cleanup.push(() => removeTempTree(root));
  const database = new TerminalDatabase(join(root, "terminal.sqlite"));
  cleanup.push(() => database.close());
  const spawn = vi.fn(() => ({ pid: 0, write() {}, resize() {}, kill() {}, onData: () => ({ dispose() {} }), onExit: () => ({ dispose() {} }) }));
  const options = { allowedRoots: [root], defaultCwd: root, maxSessions: 5, database, adapter: { spawn } };
  const first = new TerminalManager(options);
  const persistent = await first.createSession("owner", { cols: 80, rows: 24 });
  const normal = await first.createSession("owner", { cols: 80, rows: 24 });
  const current = database.getWorkspace("owner");
  database.saveWorkspace("owner", { ...current.document, entries: [persistent, normal].map((session, index) => ({ id: `entry-${index}`, runtimeId: session.runtimeId, name: `Terminal ${index}`, parentFolderId: null, sortOrder: index, pinned: false, persistent: index === 0, kind: "shell", projectId: null, initialCwd: null })) }, 0);
  first.shutdown();
  spawn.mockClear();
  return { options, database, spawn, persistent, normal };
}

test("startet nur ausdrücklich persistente Terminals erlaubter Nutzer automatisch neu", async () => {
  const { options, database, spawn, persistent, normal } = await setup();
  const current = database.getWorkspace("owner");
  database.saveWorkspace("owner", { ...current.document, entries: [...current.document.entries, { ...current.document.entries[0]!, id: "duplicate-reference" }] }, current.revision);
  const restored = new TerminalManager({ ...options, persistentSessionOwners: ["owner"] });
  cleanup.push(() => restored.shutdown());
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
  cleanup.push(() => restored.shutdown());
  expect(spawn).not.toHaveBeenCalled();
});

test("lässt einen nicht mehr erlaubten Arbeitsordner unterbrochen", async () => {
  const { options, database, spawn, persistent } = await setup();
  const stored = database.findSessionById("owner", persistent.id)!;
  database.saveSession({ ...stored, cwd: "/" });
  const restored = new TerminalManager({ ...options, persistentSessionOwners: ["owner"] });
  cleanup.push(() => restored.shutdown());
  expect(spawn).not.toHaveBeenCalled();
  expect(database.findSessionById("owner", persistent.id)?.status).toBe("interrupted");
});
