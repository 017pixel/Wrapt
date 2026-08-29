import { readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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

export function readWebBuildMetrics(distDirectory: string) {
  let releases: ReleaseRecord[] = [];
  try {
    const parsed = JSON.parse(readFileSync(join(distDirectory, ".wrapt-releases.json"), "utf8")) as unknown;
    if (Array.isArray(parsed)) {
      releases = parsed.filter((release): release is ReleaseRecord =>
        typeof release === "object"
        && release !== null
        && Number.isFinite((release as ReleaseRecord).createdAt)
        && Array.isArray((release as ReleaseRecord).files),
      );
    }
  } catch {
    // Vor dem ersten Frontendbuild sind keine Release-Metriken verfügbar.
  }

  const files = new Set<string>();
  for (const release of releases) {
    for (const file of release.files) {
      if (typeof file !== "string") continue;
      const source = safeFilePath(distDirectory, file);
      if (source === null) continue;
      for (const candidate of [source, `${source}.br`, `${source}.gz`]) {
        try {
          statSync(candidate);
          files.add(candidate);
        } catch {
          // Retention darf fehlende optionale Kompressionsvarianten melden.
        }
      }
    }
  }
  const latest = releases.at(-1);
  return {
    releaseCount: releases.length,
    retainedFileCount: files.size,
    retainedBytes: [...files].reduce((total, file) => {
      try { return total + statSync(file).size; } catch { return total; }
    }, 0),
    maxReleases: MAX_RELEASES,
    gracePeriodMilliseconds: GRACE_PERIOD_MILLISECONDS,
    latestCreatedAt: latest === undefined ? null : new Date(latest.createdAt).toISOString(),
    latestDurationMilliseconds: latest?.durationMilliseconds ?? 0,
  };
}
