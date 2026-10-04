import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { execa } from "execa";

/**
 * Neustart der laufenden Codex-Runtime nach einem Accountwechsel.
 *
 * Codex liest `auth.json` einmal beim Prozessstart und hält die Anmeldung im
 * Speicher. Ein laufender `codex app-server` — etwa der von T3 Code geteilte
 * Provider-Prozess — arbeitet deshalb nach dem Umschalten weiter mit dem alten
 * Account, obwohl der Symlink im gemeinsamen Home bereits auf den neuen zeigt.
 * T3 erkennt einen abgestürzten App-Server zudem nicht zuverlässig und startet
 * ihn nicht selbst neu.
 *
 * Deshalb wird T3 Code nach dem Umschalten einmal neu gestartet, sofern
 * tatsächlich ein Codex-App-Server läuft. Beim Start räumt T3 seine
 * Provider-Sitzungen auf und öffnet den nächsten Codex-Turn mit der frisch
 * gelesenen Anmeldung. Läuft kein App-Server, bleibt T3 unberührt.
 */

export interface CodexRuntimeProcess {
  pid: number;
  ppid: number;
  pgid: number;
  argv: string[];
}

export interface CodexRuntimeRestartOutcome {
  /** Es lief ein Codex-App-Server, dessen Anmeldung veraltet war. */
  runtimeFound: boolean;
  /** Der T3-Dienst wurde neu gestartet. */
  serviceRestarted: boolean;
  /** T3 antwortet nach dem Neustart wieder. */
  reachable: boolean;
}

export interface CodexRuntimeRestartOptions {
  serviceUnit: string;
  host: string;
  port: number;
  healthTimeoutMilliseconds?: number;
  probeIntervalMilliseconds?: number;
  listProcesses?: () => Promise<CodexRuntimeProcess[]>;
  restartService?: (serviceUnit: string) => Promise<void>;
  probeReachable?: (url: string) => Promise<boolean>;
  sleep?: (milliseconds: number) => Promise<void>;
}

/** Erkennt `codex app-server` in Wrapper- (`node …/codex app-server`) und Binärform. */
export function isCodexAppServerProcess(argv: readonly string[]): boolean {
  const index = argv.indexOf("app-server");
  if (index < 1) return false;
  const executable = argv[index - 1] ?? "";
  const name = executable.split(/[/\\]/).at(-1) ?? "";
  return name === "codex" || name === "codex.js" || name === "codex.cmd";
}

/** Liest die Prozessliste aus `/proc`; auf anderen Plattformen gibt es nichts zu tun. */
export async function listCodexRuntimeProcesses(): Promise<CodexRuntimeProcess[]> {
  if (process.platform !== "linux") return [];
  let entries: string[];
  try {
    entries = await readdir("/proc");
  } catch {
    return [];
  }
  const processes: CodexRuntimeProcess[] = [];
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const [cmdline, stat] = await Promise.all([
        readFile(join("/proc", entry, "cmdline")),
        readFile(join("/proc", entry, "stat"), "utf8"),
      ]);
      const argv = cmdline.toString("utf8").split("\0").filter((part) => part.length > 0);
      if (argv.length === 0) continue;
      // Nach dem letzten ")" stehen State, PPID und Prozessgruppe.
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      const ppid = Number(fields[1]);
      const pgid = Number(fields[2]);
      processes.push({
        pid,
        ppid: Number.isFinite(ppid) ? ppid : 0,
        pgid: Number.isFinite(pgid) ? pgid : pid,
        argv,
      });
    } catch {
      // Prozess kann zwischen Auflisten und Lesen enden oder nicht lesbar sein.
    }
  }
  return processes;
}

async function restartUserService(serviceUnit: string): Promise<void> {
  const runtimeDirectory = process.env.XDG_RUNTIME_DIR ?? `/run/user/${typeof process.getuid === "function" ? process.getuid() : 0}`;
  const result = await execa("systemctl", ["--user", "restart", serviceUnit], {
    reject: false,
    timeout: 30_000,
    env: { ...process.env, XDG_RUNTIME_DIR: runtimeDirectory },
  });
  if (result.exitCode !== 0) {
    throw new Error(`systemctl --user restart ${serviceUnit} ist fehlgeschlagen: ${result.stderr || result.stdout}`);
  }
}

/** Jede HTTP-Antwort zählt als erreichbar, auch 401 oder 404. */
async function probeHttp(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(3_000) });
    return response.status > 0;
  } catch {
    return false;
  }
}

/**
 * Startet T3 Code neu, wenn ein Codex-App-Server mit veralteter Anmeldung läuft.
 * Der Aufruf wirft nie: Der Accountwechsel ist bereits abgeschlossen, ein
 * misslungener Neustart darf ihn nicht rückgängig machen.
 */
export async function restartCodexRuntimeForAccountSwitch(
  options: CodexRuntimeRestartOptions,
): Promise<CodexRuntimeRestartOutcome> {
  const listProcesses = options.listProcesses ?? listCodexRuntimeProcesses;
  const restartService = options.restartService ?? restartUserService;
  const probeReachable = options.probeReachable ?? probeHttp;
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const healthTimeoutMilliseconds = options.healthTimeoutMilliseconds ?? 60_000;
  const probeIntervalMilliseconds = options.probeIntervalMilliseconds ?? 1_000;

  const processes = await listProcesses().catch(() => [] as CodexRuntimeProcess[]);
  if (!processes.some((process) => isCodexAppServerProcess(process.argv))) {
    return { runtimeFound: false, serviceRestarted: false, reachable: true };
  }

  try {
    await restartService(options.serviceUnit);
  } catch {
    // Ohne systemd-Einheit bleibt die laufende Runtime unangetastet; sie nutzt
    // weiter den alten Account, bis T3 anderweitig neu startet.
    return { runtimeFound: true, serviceRestarted: false, reachable: false };
  }

  const url = `http://${options.host}:${options.port}/`;
  const deadline = Date.now() + healthTimeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await probeReachable(url)) return { runtimeFound: true, serviceRestarted: true, reachable: true };
    await sleep(probeIntervalMilliseconds);
  }
  return { runtimeFound: true, serviceRestarted: true, reachable: false };
}
