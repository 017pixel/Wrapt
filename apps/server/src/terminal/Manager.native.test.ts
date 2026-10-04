import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { TerminalManager } from "./Manager.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { resolveTerminalShell } from "./shell.js";

test("native PTY-Shell antwortet, verfolgt cd, resizet und startet erneut", async () => {
  const root = mkdtempSync(join(tmpdir(), "wrapt-terminal-native-"));
  const nested = join(root, "mit Leerzeichen");
  mkdirSync(nested);
  const shell = resolveTerminalShell();
  // Native Smoke-Tests lesen keine persönlichen Startprofile oder History.
  shell.args = process.platform === "win32" ? ["-NoProfile", ...shell.args] : ["--noprofile", "--norc", ...shell.args];
  if (process.platform === "win32") {
    vi.stubEnv("APPDATA", join(root, "AppData", "Roaming"));
    vi.stubEnv("LOCALAPPDATA", join(root, "AppData", "Local"));
  }
  const manager = new TerminalManager({ allowedRoots: [root], defaultCwd: root, homeDirectory: root, maxSessions: 1, shell });
  const received: ServerTerminalMessage[] = [];
  const output = () => received.filter((message) => message.type === "terminal.output").map((message) => message.data).join("");
  try {
    const session = await manager.createSession("owner", { cols: 80, rows: 24 });
    manager.attachSession("owner", session.id, (message) => received.push(message));
    manager.writeToSession("owner", session.id, process.platform === "win32"
      ? "Write-Output ('__NATIVE_' + 'READY__'); Set-Location -LiteralPath 'mit Leerzeichen'\r"
      : "printf '__NATIVE_%s__\\n' 'READY'; cd 'mit Leerzeichen'\r");
    await vi.waitFor(() => expect(output()).toContain("__NATIVE_READY__"), { timeout: 15_000 });
    await vi.waitFor(() => expect(session.cwd).toBe(realpathSync(nested)), { timeout: 15_000 });
    manager.resizeSession("owner", session.id, 110, 32);
    expect(session).toMatchObject({ cols: 110, rows: 32, status: "running" });
    const previousPid = session.pid;
    await manager.restartSession("owner", session.id);
    expect(session.pid).not.toBe(previousPid);
    received.length = 0;
    manager.writeToSession("owner", session.id, process.platform === "win32" ? "Write-Output ('__NATIVE_' + 'RESTARTED__')\r" : "printf '__NATIVE_%s__\\n' 'RESTARTED'\r");
    await vi.waitFor(() => expect(output()).toContain("__NATIVE_RESTARTED__"), { timeout: 15_000 });
    expect(session.cwd).toBe(realpathSync(nested));
    manager.closeSession("owner", session.id);
    expect(session.status).toBe("closed");
  } finally {
    manager.shutdown();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  }
}, 40_000);
