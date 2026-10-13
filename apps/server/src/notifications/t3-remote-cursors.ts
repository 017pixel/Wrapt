import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { remoteT3SourceKey } from "./t3-remote-scheduler.js";
import type { RemoteT3Source } from "./t3-status-sync.js";

export function remoteT3CursorPath(path: string, sources: readonly RemoteT3Source[], source: RemoteT3Source): string {
  const duplicate = sources.filter((entry) => entry.host === source.host).length !== 1;
  const suffix = duplicate ? `-${createHash("sha256").update(source.databasePath).digest("hex").slice(0, 12)}` : "";
  return `${path}.remote-${source.host}${suffix}`;
}

interface Cursor { lastSequence?: unknown; pendingFinals?: unknown; sourceIdentity?: string }
export function readRemoteT3Cursor(path: string, sources: readonly RemoteT3Source[], source: RemoteT3Source): Cursor | null {
  const currentPath = remoteT3CursorPath(path, sources, source);
  const legacyPath = `${path}.remote-${source.host}`;
  const key = remoteT3SourceKey(source);
  for (const candidate of new Set([currentPath, legacyPath])) {
    try {
      const cursor = JSON.parse(readFileSync(candidate, "utf8")) as Cursor;
      if (cursor.sourceIdentity !== undefined && cursor.sourceIdentity !== key) continue;
      // Ohne alte DB-Identität übernimmt nur die bisherige erste Hostquelle den Legacycursor.
      if (candidate === legacyPath && candidate !== currentPath && cursor.sourceIdentity === undefined
        && sources.find((entry) => entry.host === source.host)?.databasePath !== source.databasePath) continue;
      return cursor;
    } catch { /* Ein fehlender oder ungültiger Cursor beginnt mit einer neuen Baseline. */ }
  }
  return null;
}
