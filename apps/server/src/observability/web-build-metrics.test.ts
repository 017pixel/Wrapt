import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWebBuildMetrics } from "./web-build-metrics.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Web-Build-Metriken", () => {
  it("liest nur vorhandene Dateien aus dem Release-Manifest", () => {
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

    expect(readWebBuildMetrics(root)).toMatchObject({
      releaseCount: 1,
      retainedFileCount: 2,
      maxReleases: 3,
      latestDurationMilliseconds: 23,
    });
  });

  it("liefert vor dem ersten Build eine leere, gültige Metrik", () => {
    const root = mkdtempSync(join(tmpdir(), "web-build-metrics-empty-"));
    roots.push(root);
    expect(readWebBuildMetrics(root)).toMatchObject({ releaseCount: 0, retainedFileCount: 0, retainedBytes: 0, latestCreatedAt: null });
  });
});
