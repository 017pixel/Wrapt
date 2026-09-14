import { mkdir, mkdtemp, realpath, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalManager } from "./Manager.js";
import type { PtyProcess } from "./NodePtyAdapter.js";
import { TerminalDatabase } from "./database.js";
import { canonicalCwdWithinRootsSync, validateCwd } from "./restore.js";

const directories: string[] = [];
const managers: TerminalManager[] = [];

async function temporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  for (const manager of managers.splice(0)) manager.shutdown();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

class FakePty implements PtyProcess {
  pid = 7;
  write() {}
  resize() {}
  kill() {}
  onData() { return { dispose: () => {} }; }
  onExit() { return { dispose: () => {} }; }
}

describe("kanonische Terminal-Arbeitsverzeichnisse", () => {
  it("akzeptiert die Wurzel und Verzeichnisse innerhalb, auch über interne Symlinks", async () => {
    const root = await temporaryDirectory("wrapt-cwd-root-");
    await mkdir(join(root, "inside"));
    await symlink(join(root, "inside"), join(root, "nested-link"), "dir");

    expect(await validateCwd(root, [root])).toBe(await realpath(root));
    expect(await validateCwd(join(root, "inside"), [root])).toBe(await realpath(join(root, "inside")));
    expect(await validateCwd(join(root, "nested-link"), [root])).toBe(await realpath(join(root, "inside")));
  });

  it("lehnt einen Symlink ab, der die erlaubte Wurzel verlässt", async () => {
    const root = await temporaryDirectory("wrapt-cwd-root-");
    const outside = await temporaryDirectory("wrapt-cwd-outside-");
    await symlink(outside, join(root, "escape"), "dir");

    await expect(validateCwd(join(root, "escape"), [root])).rejects.toMatchObject({ code: "INVALID_CWD" });
  });

  it("unterscheidet fehlende, ungültige und verwandte Pfade", async () => {
    const root = await temporaryDirectory("wrapt-cwd-root-");
    await expect(validateCwd(join(root, "missing"), [root])).rejects.toMatchObject({ code: "CWD_NOT_FOUND" });
    await expect(validateCwd(`${root}-sibling`, [root])).rejects.toMatchObject({ code: "INVALID_CWD" });
    await expect(validateCwd("/", [root])).rejects.toMatchObject({ code: "INVALID_CWD" });
  });

  it("erkennt einen Symlink-Austausch zwischen zwei Prüfungen", async () => {
    const root = await temporaryDirectory("wrapt-cwd-root-");
    const outside = await temporaryDirectory("wrapt-cwd-outside-");
    const swap = join(root, "swap");
    await mkdir(swap);

    expect(await validateCwd(swap, [root])).toBe(await realpath(swap));
    await rename(swap, join(root, "swap-original"));
    await symlink(outside, swap, "dir");

    await expect(validateCwd(swap, [root])).rejects.toMatchObject({ code: "INVALID_CWD" });
  });

  it("importiert nur kanonische Pfade und fällt sonst auf die Wurzel zurück", async () => {
    const root = await temporaryDirectory("wrapt-cwd-root-");
    const outside = await temporaryDirectory("wrapt-cwd-outside-");
    await mkdir(join(root, "inside"));

    expect(canonicalCwdWithinRootsSync(outside, [root])).toBeNull();
    expect(canonicalCwdWithinRootsSync(join(root, "inside"), [root])).toBe(await realpath(join(root, "inside")));
  });

  it("quarantäniert eine gespeicherte Session mit ausgetauschtem CWD vor dem Spawn", async () => {
    const root = await temporaryDirectory("wrapt-cwd-root-");
    const outside = await temporaryDirectory("wrapt-cwd-outside-");
    const database = new TerminalDatabase(join(root, "terminal.sqlite"));
    const runtimeId = "00000000-0000-4000-8000-000000000001";
    const options = {
      allowedRoots: [root],
      defaultCwd: root,
      maxSessions: 2,
      database,
      adapter: { spawn: () => new FakePty() },
    };
    const first = new TerminalManager(options);
    managers.push(first);
    const workspace = join(root, "workspace");
    await mkdir(workspace);
    const session = await first.createSession("owner", { runtimeId, cwd: workspace, cols: 80, rows: 24 });
    first.shutdown();
    managers.splice(managers.indexOf(first), 1);

    // Zwischen Persistenz und Neustart wird der ehemals gültige Ordner durch
    // einen Symlink aus der Wurzel heraus ersetzt.
    await rename(workspace, join(root, "workspace-original"));
    await symlink(outside, workspace, "dir");

    const second = new TerminalManager(options);
    managers.push(second);
    await expect(second.createSession("owner", { runtimeId, cols: 80, rows: 24 })).rejects.toMatchObject({ code: "INVALID_CWD" });
    expect(second.getSessionMetadata("owner", session.id).status).toBe("interrupted");
    second.shutdown();
    managers.splice(managers.indexOf(second), 1);
    database.close();
  });
});
