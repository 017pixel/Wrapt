import { chmodSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { supportsSystemd } from "../system/platform.js";

/** Socket im privaten Runtime-Verzeichnis oder ersatzweise im Datenverzeichnis. */
export function defaultTerminalSocketPath(
  dataDirectory: string,
  runtimeDirectory = process.env.XDG_RUNTIME_DIR,
  platform: NodeJS.Platform = process.platform,
): string {
  if (runtimeDirectory?.trim()) return join(runtimeDirectory, "wrapt", "tmux.sock");
  if (supportsSystemd(platform)) {
    return `/run/user/${process.getuid?.() ?? process.env.UID ?? "1000"}/wrapt/tmux.sock`;
  }
  return join(dataDirectory, "run", "tmux.sock");
}

export const TERMINAL_SUPERVISOR_UNIT = "wrapt-terminal-supervisor.service";
export const TERMINAL_SUPERVISOR_SESSION = "wrapt-supervisor";

export function terminalSupervisorStartArgs(socketPath: string): string[] {
  return ["-S", socketPath, "new-session", "-d", "-s", TERMINAL_SUPERVISOR_SESSION];
}

export function ensurePrivateSocketDirectory(socketPath: string): void {
  const directory = dirname(socketPath);
  let created = false;
  try { statSync(directory); } catch { created = true; }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Nur ein neu angelegtes Verzeichnis oder das dedizierte Wrapt-Verzeichnis
  // bekommt erzwungene Rechte. Ein frei gewählter Elternordner (etwa $HOME)
  // darf durch einen Socket-Pfad nicht umgestellt werden.
  if (created || basename(directory) === "wrapt") chmodSync(directory, 0o700);
}
