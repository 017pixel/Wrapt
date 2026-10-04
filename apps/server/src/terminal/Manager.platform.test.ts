import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { TerminalManager } from "./Manager.js";
import type { PtyAdapter } from "./NodePtyAdapter.js";
import type { ServerTerminalMessage } from "./protocol.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const dispose of cleanup.splice(0).reverse()) dispose(); });

test.each(["linux", "darwin", "win32"] as const)("Eingabe, CWD, Resize, Neustart und Schließen verwenden die %s-Prozesssemantik", async (platform) => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-platform-"));
  const nested = join(root, "nested");
  mkdirSync(nested);
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const processes: Array<{ kill: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn>; resize: ReturnType<typeof vi.fn>; output: ((data: string) => void) | undefined }> = [];
  const spawn = vi.fn<PtyAdapter["spawn"]>(() => {
    const process = { pid: 0, write: vi.fn(), resize: vi.fn(), kill: vi.fn(), output: undefined as ((data: string) => void) | undefined };
    processes.push(process);
    return { ...process, onData: (callback) => { process.output = callback; return { dispose: () => { process.output = undefined; } }; }, onExit: () => ({ dispose() {} }) };
  });
  const manager = new TerminalManager({ allowedRoots: [root], defaultCwd: root, homeDirectory: root, maxSessions: 1, platform, adapter: { spawn } });
  cleanup.push(() => manager.shutdown());
  const session = await manager.createSession("owner", { cols: 80, rows: 24 });
  const received: ServerTerminalMessage[] = [];
  manager.attachSession("owner", session.id, (message) => received.push(message));
  expect(spawn.mock.calls[0]?.[0]).toMatch(platform === "win32" ? /powershell\.exe$/ : /\/bin\/bash$/);
  expect(spawn.mock.calls[0]?.[2]).toMatchObject({ cols: 80, rows: 24, env: { HOME: root }, ...(platform === "win32" ? { useConpty: true } : {}) });
  manager.writeToSession("owner", session.id, "echo test\r");
  manager.resizeSession("owner", session.id, 100, 30);
  expect(processes[0]?.write).toHaveBeenCalledWith("echo test\r");
  expect(processes[0]?.resize).toHaveBeenCalledWith(100, 30);
  const expectedCwd = platform === "win32" ? nested : nested.replaceAll("\\", "/");
  const urlPath = /^[a-z]:/i.test(expectedCwd) ? `/${expectedCwd}` : expectedCwd;
  const cwdMessage = platform === "win32" ? `\x1b]9;9;"${expectedCwd}"\x1b\\` : `\x1b]7;file://host${urlPath}\x1b\\`;
  // Escape-Sequenzen können in beliebigen PTY-Chunks ankommen.
  processes[0]?.output?.(cwdMessage.slice(0, 8));
  processes[0]?.output?.(cwdMessage.slice(8) + "bereit");
  await vi.waitFor(() => expect(session.headless?.snapshot().serialized).toContain("bereit"));
  expect(session.cwd).toBe(expectedCwd);
  expect(received).toContainEqual({ type: "terminal.cwd", sessionId: session.id, cwd: expectedCwd });
  await manager.restartSession("owner", session.id);
  expect(processes[0]?.kill).toHaveBeenCalledWith(platform === "win32" ? undefined : "SIGTERM");
  expect(spawn).toHaveBeenCalledTimes(2);
  expect(session.epoch).toBe(1);
  manager.closeSession("owner", session.id);
  expect(processes[1]?.kill).toHaveBeenCalledWith(platform === "win32" ? undefined : "SIGTERM");
  expect(received).toContainEqual(expect.objectContaining({ type: "terminal.exited" }));
});
