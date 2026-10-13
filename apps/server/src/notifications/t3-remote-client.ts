import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { REMOTE_READER_SCRIPT } from "./t3-remote-reader.js";
import type { RemoteSnapshot, RemoteT3Source } from "./t3-status-sync.js";

const execFileAsync = promisify(execFile);

export async function readRemoteT3Snapshot(source: RemoteT3Source,
  state: { lastSequence: number; initialized: boolean }, signal: AbortSignal): Promise<RemoteSnapshot> {
  // Argumente bleiben innerhalb einzelner Shellwörter; das Skript wird Base64 übertragen.
  const encoded = Buffer.from(REMOTE_READER_SCRIPT, "utf8").toString("base64");
  const command = `echo ${encoded} | base64 -d | python3 - '${source.databasePath.replaceAll("'", "'\\''")}' '${source.environmentIdPath.replaceAll("'", "'\\''")}' ${state.lastSequence} ${state.initialized ? 1 : 0}`;
  const { stdout } = await execFileAsync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", source.host, command], {
    timeout: 20_000, maxBuffer: 8 * 1024 * 1024, signal,
  });
  const snapshot = JSON.parse(stdout) as RemoteSnapshot;
  if (!Number.isSafeInteger(snapshot.currentSequence) || snapshot.currentSequence < 0
    || typeof snapshot.environmentId !== "string" || !Array.isArray(snapshot.rows)
    || !snapshot.activities || typeof snapshot.activities !== "object") throw new Error("Ungültiger T3-Remote-Snapshot.");
  return snapshot;
}
