import { mkdirSync, mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { TerminalManager } from "./Manager.js";
import type { ServerTerminalMessage } from "./protocol.js";
import { resolveTerminalShell } from "./shell.js";
import { removeTempTree, waitForProcessExit } from "./terminalTestCleanup.js";

/**
 * `realpathSync` lässt unter Windows den 8.3-Kurzpfad stehen
 * (`C:\Users\RUNNER~1\...`), den `tmpdir()` liefert. Die native Variante geht
 * über `GetFinalPathNameByHandle` und antwortet mit dem Langpfad. Windows
 * vergleicht Pfade ohne Groß- und Kleinschreibung.
 */
function sameDirectory(reported: string, expected: string): boolean {
  const canonical = (path: string) => {
    const resolved = realpathSync.native(path);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return canonical(reported) === canonical(expected);
}

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
  let lastPid: number | undefined;
  try {
    const session = await manager.createSession("owner", { cols: 80, rows: 24 });
    manager.attachSession("owner", session.id, (message) => received.push(message));
    manager.writeToSession("owner", session.id, process.platform === "win32"
      ? "Write-Output ('__NATIVE_' + 'READY__'); Set-Location -LiteralPath 'mit Leerzeichen'\r"
      : "printf '__NATIVE_%s__\\n' 'READY'; cd 'mit Leerzeichen'\r");
    await vi.waitFor(() => expect(output()).toContain("__NATIVE_READY__"), { timeout: 15_000 });
    await vi.waitFor(() => expect(sameDirectory(session.cwd, nested)).toBe(true), { timeout: 15_000 });
    manager.resizeSession("owner", session.id, 110, 32);
    expect(session).toMatchObject({ cols: 110, rows: 32, status: "running" });
    const previousPid = session.pid;
    await manager.restartSession("owner", session.id);
    expect(session.pid).not.toBe(previousPid);
    lastPid = session.pid;
    received.length = 0;
    manager.writeToSession("owner", session.id, process.platform === "win32" ? "Write-Output ('__NATIVE_' + 'RESTARTED__')\r" : "printf '__NATIVE_%s__\\n' 'RESTARTED'\r");
    await vi.waitFor(() => expect(output()).toContain("__NATIVE_RESTARTED__"), { timeout: 15_000 });
    expect(sameDirectory(session.cwd, nested)).toBe(true);
    manager.closeSession("owner", session.id);
    expect(session.status).toBe("closed");
  } finally {
    manager.shutdown();
    vi.unstubAllEnvs();
    // Unter Windows blockiert ein noch laufender Prozess das Löschen seines
    // Arbeitsverzeichnisses, weil es dessen aktuelles Verzeichnis ist.
    await removeTempTree(root, () => waitForProcessExit(lastPid));
  }
}, 40_000);
