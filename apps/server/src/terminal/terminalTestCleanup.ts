import { rmSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

/** Fehlercodes, mit denen das Löschen scheitert, solange ein Prozess oder tmux noch lebt. */
const busyCodes = new Set(["EBUSY", "ENOTEMPTY", "EPERM", "EACCES"]);

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/**
 * `stopProcess` feuert das Signal und räumt seine Listener sofort auf, danach
 * wartet niemand mehr auf das Prozessende. Ein noch lebender Prozess blockiert
 * das Löschen seines Arbeitsverzeichnisses, und ein tmux-Server legt seinen
 * Socket nach dem `kill-server` erneut an. Beides trifft nur die Testbereinigung,
 * nicht den Betrieb, deshalb wird hier mit Wartezeit und Backoff entfernt.
 */
export async function removeTempTree(root: string, before?: () => Promise<void> | void): Promise<void> {
  if (before) await before();
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
      return;
    } catch (error) {
      if (!busyCodes.has(errorCode(error) ?? "")) throw error;
      await delay(100);
    }
  }
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/**
 * Wartet, bis eine PID verschwunden ist. Nötig, weil `stopProcess` den
 * Exit-Listener vorher entsorgt und es damit kein Ereignis zum Abwarten gibt.
 */
export async function waitForProcessExit(pid: number | undefined, timeoutMs = 15_000): Promise<void> {
  if (!pid || pid <= 0) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await delay(50);
  }
}