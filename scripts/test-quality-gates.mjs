#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const checker = join(repositoryRoot, "scripts/architecture/check-file-lines.mjs");
const vitest = join(repositoryRoot, "node_modules/vitest/vitest.mjs");
const root = await mkdtemp(join(tmpdir(), "wrapt-quality-gates-"));

async function expectFailure(command, args, options = {}) {
  try {
    await run(command, args, options);
  } catch (error) {
    if (error?.code !== undefined || error?.status !== 0) return;
  }
  throw new Error("Die absichtlich fehlschlagende Qualitäts-Fixture blieb grün.");
}

try {
  const lineRoot = join(root, "file-lines");
  await mkdir(lineRoot, { recursive: true });
  await writeFile(join(lineRoot, "file-line-baseline.json"), "{}\n");
  await writeFile(join(lineRoot, "fixture.ts"), `${"export const line = 1;\n".repeat(401)}`);
  await expectFailure(process.execPath, [checker], {
    cwd: repositoryRoot,
    env: { ...process.env, WRAPT_FILE_LINES_ROOT: lineRoot, WRAPT_FILE_LINES_BASELINE: join(lineRoot, "file-line-baseline.json") },
  });
  await writeFile(join(lineRoot, "fixture.ts"), `${"export const line = 1;\n".repeat(400)}`);
  await run(process.execPath, [checker], {
    cwd: repositoryRoot,
    env: { ...process.env, WRAPT_FILE_LINES_ROOT: lineRoot, WRAPT_FILE_LINES_BASELINE: join(lineRoot, "file-line-baseline.json") },
  });

  const coverageRoot = join(root, "coverage");
  await mkdir(coverageRoot, { recursive: true });
  await writeFile(join(coverageRoot, "source.ts"), "export function branch(value) { if (value) return 1; return 0; }\n");
  await writeFile(join(coverageRoot, "source.test.ts"), "import { expect, it } from 'vitest'; import { branch } from './source'; it('deckt nur einen Zweig ab', () => expect(branch(true)).toBe(1));\n");
  await writeFile(join(coverageRoot, "vitest.config.mjs"), `import { defineConfig } from ${JSON.stringify("vitest/config")}; export default defineConfig({ test: { include: [${JSON.stringify(join(coverageRoot, "source.test.ts"))}], coverage: { provider: "v8", include: [${JSON.stringify(join(coverageRoot, "source.ts"))}], thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 } } } });\n`);
  await expectFailure(process.execPath, [vitest, "run", "--coverage", "--config", join(coverageRoot, "vitest.config.mjs")], { cwd: repositoryRoot });
  process.stdout.write("Quality-Gates regressionsfest: File-Lines und Coverage schlagen in isolierten Fixtures fehl.\n");
} finally {
  await rm(root, { recursive: true, force: true });
}
