import * as nodePty from "node-pty";
import { accessSync, chmodSync, constants, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const nodePtyRoot = dirname(dirname(require.resolve("node-pty")));

/** Manche macOS-Installationen entpacken spawn-helper ohne das Ausführungsbit. */
export function ensureMacPtySpawnHelperExecutable(
  platform: NodeJS.Platform = process.platform,
  packageRoot = nodePtyRoot,
  architecture = process.arch,
): void {
  if (platform !== "darwin") return;
  const nativeDirectories = [
    join(packageRoot, "build", "Release"),
    join(packageRoot, "build", "Debug"),
    join(packageRoot, "prebuilds", `${platform}-${architecture}`),
  ];
  const nativeDirectory = nativeDirectories.find((directory) => existsSync(join(directory, "pty.node")));
  if (!nativeDirectory) return;
  const helper = join(nativeDirectory, "spawn-helper");
  if (!existsSync(helper)) return;
  try { accessSync(helper, constants.X_OK); return; }
  catch { /* Die Dateiberechtigung wird unten für den eigenen Benutzer ergänzt. */ }
  try { chmodSync(helper, (statSync(helper).mode & 0o777) | 0o111); }
  catch { /* Der folgende PTY-Start liefert den eigentlichen Laufzeitfehler. */ }
}

export interface PtyProcess {
  readonly pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(callback: (data: string) => void): { dispose(): void };
  onExit(callback: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
}

export interface PtyAdapter {
  spawn(shell: string, args: string[], options: nodePty.IPtyForkOptions): PtyProcess;
}

export const nodePtyAdapter: PtyAdapter = {
  spawn: (shell, args, options) => {
    ensureMacPtySpawnHelperExecutable();
    return nodePty.spawn(shell, args, options);
  },
};
