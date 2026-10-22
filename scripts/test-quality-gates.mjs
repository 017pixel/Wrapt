#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

const run = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const checker = join(repositoryRoot, "scripts/architecture/check-file-lines.mjs");
const workspaceRoot = join(repositoryRoot, "apps/web");
const require = createRequire(join(workspaceRoot, "package.json"));
const vitest = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");
const root = await mkdtemp(join(tmpdir(), "wrapt-quality-gates-"));

async function expectFailure(command, args, expected, options = {}) {
  try {
    await run(command, args, options);
  } catch (error) {
    const output = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (typeof error.code === "number" && error.code !== 0 && expected.test(output)) return;
    throw new Error(`Die Qualitäts-Fixture scheiterte aus einem unerwarteten Grund:\n${output}`, { cause: error });
  }
  throw new Error("Die absichtlich fehlschlagende Qualitäts-Fixture blieb grün.");
}

try {
  const { createVitest } = await import(pathToFileURL(require.resolve("vitest/node")).href);
  for (const workspace of ["apps/server", "apps/web"]) {
    const context = await createVitest("test", { root: join(repositoryRoot, workspace), watch: false });
    try {
      if (!(context.config.coverage.thresholds?.lines > 0)) throw new Error(`Coverage-Grenzen sind für ${workspace} nicht aktiv.`);
    } finally { await context.close(); }
  }
  const lineRoot = join(root, "file-lines");
  await mkdir(lineRoot, { recursive: true });
  await writeFile(join(lineRoot, "file-line-baseline.json"), "{}\n");
  await writeFile(join(lineRoot, "fixture.ts"), `${"export const line = 1;\n".repeat(401)}`);
  await expectFailure(process.execPath, [checker], /401\s+fixture\.ts \(Limit\/Baseline 400\)/, {
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
  await symlink(join(workspaceRoot, "node_modules"), join(coverageRoot, "node_modules"), "dir");
  await writeFile(join(coverageRoot, "source.ts"), "export function branch(value) { if (value) return 1; return 0; }\n");
  await writeFile(join(coverageRoot, "source.test.ts"), "import { expect, it } from 'vitest'; import { branch } from './source'; it('deckt nur einen Zweig ab', () => expect(branch(true)).toBe(1));\n");
  await writeFile(join(coverageRoot, "vitest.config.mjs"), `export default { test: { root: ${JSON.stringify(coverageRoot)}, include: ["source.test.ts"], coverage: { provider: "v8", include: ["source.ts"], reporter: ["text"], thresholds: { lines: 100, functions: 100, statements: 100, branches: 100 } } } };\n`);
  const coverageArgs = [vitest, "run", "--coverage", "--config", join(coverageRoot, "vitest.config.mjs")];
  await expectFailure(process.execPath, coverageArgs, /ERROR: Coverage for branches .* does not meet global threshold \(100%\)/, { cwd: workspaceRoot });
  await writeFile(join(coverageRoot, "source.test.ts"), "import { expect, it } from 'vitest'; import { branch } from './source'; it('deckt beide Zweige ab', () => { expect(branch(true)).toBe(1); expect(branch(false)).toBe(0); });\n");
  await run(process.execPath, coverageArgs, { cwd: workspaceRoot });
  process.stdout.write("Quality-Gates regressionsfest: File-Lines und Coverage mit negativer und positiver Gegenprobe geprüft.\n");
} finally {
  await rm(root, { recursive: true, force: true });
}
