#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const compressor = join(repositoryRoot, "apps/web/scripts/compress-dist.mjs");
const directory = await mkdtemp(join(tmpdir(), "wrapt-artifact-retention-"));

try {
  await mkdir(join(directory, "assets"), { recursive: true });
  await writeFile(join(directory, "index.html"), "<!doctype html><script type=module src=/assets/release-0.js></script>\n");
  for (let release = 0; release < 20; release += 1) {
    const asset = `assets/release-${release}.js`;
    await writeFile(join(directory, "index.html"), `<!doctype html><script type=module src=/${asset}></script>\n`);
    await writeFile(join(directory, "build-manifest.json"), JSON.stringify({ entry: { file: asset } }));
    await writeFile(join(directory, asset), `export default ${JSON.stringify("retention-".repeat(2_000) + release)};\n`);
    await run(process.execPath, [compressor], {
      env: { ...process.env, WRAPT_E2E_WEB_OUT_DIR: directory, COMPRESSION_THRESHOLD_BYTES: "0" },
    });
    const assets = await readdir(join(directory, "assets"));
    if (assets.length > 9) throw new Error(`Artifact-Retention überschreitet nach Build ${release + 1} drei Releases.`);
    if (release >= 3 && assets.some((name) => name.startsWith(`release-${release - 3}.`))) {
      throw new Error(`Altes Frontend-Release ${release - 3} wurde nicht entfernt.`);
    }
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1_000);
    await Promise.all(assets
      .filter((name) => !name.startsWith(`release-${release}.`))
      .map((name) => utimes(join(directory, "assets", name), oldTime, oldTime)));
  }
  process.stdout.write("Web-Artifact-Retention OK (20 isolierte Release-Läufe, maximal 3 Releases).\n");
} finally {
  await rm(directory, { recursive: true, force: true });
}
