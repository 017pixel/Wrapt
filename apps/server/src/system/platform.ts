/** systemd-User-Units werden ausschließlich auf Linux unterstützt. */
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export function supportsSystemd(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "linux";
}

function isExecutable(path: string): boolean {
  try { accessSync(path, constants.X_OK); return true; }
  catch { return false; }
}

/** Nutzt auf macOS einen verfügbaren tmux aus PATH, falls die Beispiel-Config Linux-Pfade setzt. */
export function resolveTmuxExecutable(
  configuredPath: string,
  platform: NodeJS.Platform = process.platform,
  searchPath = process.env.PATH ?? "",
): string {
  if (platform !== "darwin" || isExecutable(configuredPath)) return configuredPath;
  const candidates = [
    ...searchPath.split(delimiter).filter(Boolean).map((directory) => join(directory, "tmux")),
    "/opt/homebrew/bin/tmux",
    "/usr/local/bin/tmux",
  ];
  return candidates.find(isExecutable) ?? configuredPath;
}
