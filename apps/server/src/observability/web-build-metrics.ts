import { readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createAsyncCache } from "../utils/cache.js";

interface ReleaseRecord {
  createdAt: number;
  durationMilliseconds?: number;
  files: string[];
}

const MAX_RELEASES = 3;
const GRACE_PERIOD_MILLISECONDS = 24 * 60 * 60 * 1_000;

function safeFilePath(root: string, value: string): string | null {
  const candidate = resolve(root, value);
  const relativePath = relative(resolve(root), candidate);
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes("/../")) return null;
  return candidate;
}

export async function readWebBuildMetrics(distDirectory: string) {
  let releases: ReleaseRecord[] = [];
  try {
    const parsed = JSON.parse(await readFile(join(distDirectory, ".wrapt-releases.json"), "utf8")) as unknown;
    if (Array.isArray(parsed)) {
      releases = parsed.filter((release): release is ReleaseRecord =>
        typeof release === "object"
        && release !== null
        && Number.isFinite((release as ReleaseRecord).createdAt)
        && Array.isArray((release as ReleaseRecord).files),
      );
    }
  } catch (error) {
    if (!(error instanceof SyntaxError) && (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    // Vor dem ersten Frontendbuild sind keine Release-Metriken verfügbar.
  }

  const candidates = new Set<string>();
  for (const release of releases) {
    for (const file of release.files) {
      if (typeof file !== "string") continue;
      const source = safeFilePath(distDirectory, file);
      if (source === null) continue;
      for (const candidate of [source, `${source}.br`, `${source}.gz`]) candidates.add(candidate);
    }
  }
  let retainedFileCount = 0;
  let retainedBytes = 0;
  // Begrenzte I/O-Parallelität; jede Datei einschließlich ihrer Größe einmal lesen.
  const files = candidates.values();
  await Promise.all(Array.from({ length: Math.min(16, candidates.size) }, async () => {
    for (const file of files) {
      try {
        const info = await stat(file);
        retainedFileCount += 1;
        retainedBytes += info.size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        // Fehlende optionale Kompressionsvarianten zählen nicht zur Retention.
      }
    }
  }));
  const latest = releases.at(-1);
  return {
    releaseCount: releases.length,
    retainedFileCount,
    retainedBytes,
    maxReleases: MAX_RELEASES,
    gracePeriodMilliseconds: GRACE_PERIOD_MILLISECONDS,
    latestCreatedAt: latest === undefined ? null : new Date(latest.createdAt).toISOString(),
    latestDurationMilliseconds: latest?.durationMilliseconds ?? 0,
  };
}

async function releaseVersion(distDirectory: string): Promise<string> {
  try {
    const info = await stat(join(distDirectory, ".wrapt-releases.json"));
    return `${info.dev}:${info.ino}:${info.mtimeMs}:${info.ctimeMs}:${info.size}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return "missing";
  }
}

/** Pro Ausgabepfad ein Snapshot; Operativmetriken bleiben außerhalb dieses Caches. */
export function createWebBuildMetricsReader(distDirectory: string, ttlMilliseconds: number) {
  let generation = 0;
  let version: string | undefined;
  let pending: Promise<Awaited<ReturnType<typeof readWebBuildMetrics>>> | undefined;
  const cache = createAsyncCache(ttlMilliseconds, async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await releaseVersion(distDirectory);
      const result = await readWebBuildMetrics(distDirectory);
      if (before === await releaseVersion(distDirectory)) return result;
    }
    throw new Error("Frontend-Releaseindex wechselt während der Diagnose.");
  });
  return {
    clear() {
      generation += 1;
      cache.clear();
      version = undefined;
      pending = undefined;
    },
    get() {
      if (pending) return pending;
      const loadingGeneration = generation;
      const loading = (async () => {
        const current = await releaseVersion(distDirectory);
        if (loadingGeneration === generation && version !== current) {
          cache.clear();
          version = current;
        }
        try { return await cache.get(); } catch (error) {
          if (loadingGeneration === generation) {
            cache.clear();
            version = undefined;
          }
          throw error;
        }
      })().finally(() => { if (pending === loading) pending = undefined; });
      pending = loading;
      return loading;
    },
  };
}
