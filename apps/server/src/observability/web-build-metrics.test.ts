import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { createWebBuildMetricsReader, readWebBuildMetrics } from "./web-build-metrics.js";

vi.mock("node:fs/promises", { spy: true });

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Web-Build-Metriken", () => {
  it("teilt parallele Reads und zählt gemeinsame Release-Dateien nur einmal", async () => {
    const root = mkdtempSync(join(tmpdir(), "web-build-shared-"));
    roots.push(root);
    writeFileSync(join(root, "entry.js"), "entry");
    const manifest = join(root, ".wrapt-releases.json");
    writeFileSync(manifest, JSON.stringify([1, 2, 3].map((createdAt) => ({ createdAt, files: ["entry.js"] }))));
    const spy = vi.spyOn(fs, "stat");
    const reader = createWebBuildMetricsReader(root, 60_000);
    const snapshots = await Promise.all(Array.from({ length: 10 }, () => reader.get()));
    expect(snapshots.every((snapshot) => snapshot === snapshots[0])).toBe(true);
    expect(snapshots[0]).toMatchObject({ releaseCount: 3, retainedFileCount: 1, retainedBytes: 5 });
    expect(spy.mock.calls.filter(([path]) => path === join(root, "entry.js"))).toHaveLength(1);
    spy.mockClear();
    await reader.get();
    expect(spy.mock.calls).toHaveLength(1);
    expect(spy.mock.calls[0]?.[0]).toBe(manifest);

    writeFileSync(manifest, JSON.stringify([{ createdAt: 4, files: [] }]));
    expect(await reader.get()).toMatchObject({ releaseCount: 1, retainedFileCount: 0 });
  });

  it("prüft manuelle Löschungen nach TTL und explizitem Refresh", async () => {
    vi.useFakeTimers();
    const root = mkdtempSync(join(tmpdir(), "web-build-ttl-"));
    roots.push(root);
    const asset = join(root, "entry.js.br");
    writeFileSync(asset, "br");
    writeFileSync(join(root, ".wrapt-releases.json"), JSON.stringify([{ createdAt: 1, files: ["entry.js"] }]));
    const reader = createWebBuildMetricsReader(root, 60_000);
    expect((await reader.get()).retainedBytes).toBe(2);
    rmSync(asset);
    expect((await reader.get()).retainedBytes).toBe(2);
    vi.advanceTimersByTime(60_000);
    expect((await reader.get()).retainedBytes).toBe(0);
    writeFileSync(asset, "restored");
    reader.clear();
    expect((await reader.get()).retainedBytes).toBe(8);
  });

  it("erholt sich nach beschädigtem und atomar ersetztem Releaseindex", async () => {
    const root = mkdtempSync(join(tmpdir(), "web-build-invalid-"));
    roots.push(root);
    const manifest = join(root, ".wrapt-releases.json");
    writeFileSync(manifest, "{");
    const reader = createWebBuildMetricsReader(root, 60_000);
    expect((await reader.get()).releaseCount).toBe(0);
    writeFileSync(join(root, "next.json"), JSON.stringify([{ createdAt: 1, files: [] }]));
    await fs.rename(join(root, "next.json"), manifest);
    expect((await reader.get()).releaseCount).toBe(1);
  });
  it("liest nur vorhandene Dateien aus dem Release-Manifest", async () => {
    const root = mkdtempSync(join(tmpdir(), "web-build-metrics-"));
    roots.push(root);
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "assets", "entry.js"), "entry");
    writeFileSync(join(root, "assets", "entry.js.br"), "br");
    writeFileSync(join(root, ".wrapt-releases.json"), JSON.stringify([{
      createdAt: Date.now(),
      durationMilliseconds: 23,
      files: ["assets/entry.js", "assets/missing.js", "../outside"],
    }]));

    expect(await readWebBuildMetrics(root)).toMatchObject({
      releaseCount: 1,
      retainedFileCount: 2,
      maxReleases: 3,
      latestDurationMilliseconds: 23,
    });
  });

  it("liefert vor dem ersten Build eine leere, gültige Metrik", async () => {
    const root = mkdtempSync(join(tmpdir(), "web-build-metrics-empty-"));
    roots.push(root);
    expect(await readWebBuildMetrics(root)).toMatchObject({ releaseCount: 0, retainedFileCount: 0, retainedBytes: 0, latestCreatedAt: null });
  });
});
