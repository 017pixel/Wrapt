#!/usr/bin/env node
/**
 * Führt die Playwright-Suite in mehreren, voneinander isolierten Shards aus.
 *
 * Jeder Shard bekommt einen eigenen Portbereich, ein eigenes temporäres
 * Datenverzeichnis und einen eigenen Server. Geteilt wird nur der einmal
 * gebaute Web-Build. Die Dateiaufteilung bleibt innerhalb eines Specs
 * zusammen, damit serielle Zustände einer Datei erhalten bleiben.
 *
 * Lokal startet das Skript alle Shards parallel. In der CI läuft pro Job
 * genau ein Shard (`--shard i --shards n --build`).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve("@playwright/test/cli");
// `--plan | head` darf keinen EPIPE-Sturz auslösen.
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
const shardPortSpacing = 500;
const ignoredSpecs = new Set([
  // Diese beiden Harness-Specs laufen ausschließlich über ihre eigenen
  // Konfigurationen und gehören nicht in den Standarddurchlauf.
  "tests/e2e/orbit-performance.spec.ts",
  "tests/e2e/preview-start-performance.spec.ts",
]);
const weightMultipliers = new Map([
  // Die Einstellungs-Kreuzwirkungen besuchen pro Test alle Hauptseiten und
  // kosten deutlich mehr als ein einzelner UI-Test.
  ["e2e/impact.spec.ts", 4],
  ["e2e/negative.spec.ts", 2],
  ["e2e/journeys.spec.ts", 4],
  ["tests/e2e/responsive-shell.spec.ts", 2],
]);

const options = parseArguments(process.argv.slice(2));
const external = process.env.WRAPT_E2E_EXTERNAL === "true" || Boolean(process.env.WRAPT_E2E_URL?.trim());
const shardCount = options.shards ?? configuredShardCount();
if (!Number.isInteger(shardCount) || shardCount < 1) throw new Error("--shards muss eine positive Ganzzahl sein.");
if (options.shard !== undefined && (!Number.isInteger(options.shard) || options.shard < 0 || options.shard >= shardCount)) {
  throw new Error(`--shard muss zwischen 0 und ${shardCount - 1} liegen.`);
}
if (external && (options.shard !== undefined || options.shards !== undefined)) {
  throw new Error("Ein externer E2E-Server (WRAPT_E2E_EXTERNAL=true oder WRAPT_E2E_URL) kann nicht geshardet werden.");
}

const specs = await collectSpecs();
const shards = assignSpecs(specs, shardCount);

if (options.plan) {
  for (const [index, shard] of shards.entries()) {
    process.stdout.write(`Shard ${index + 1}/${shardCount} (Gewicht ${shard.load}):\n`);
    for (const file of shard.files) process.stdout.write(`  ${file}\n`);
  }
  process.exitCode = 0;
} else if (options.shard !== undefined) {
  const ownsWebDist = !external && !process.env.WRAPT_E2E_WEB_OUT_DIR?.trim();
  const webDist = external
    ? undefined
    : process.env.WRAPT_E2E_WEB_OUT_DIR?.trim() || await mkdtemp(join(tmpdir(), "wrapt-e2e-web-"));
  try {
    process.exitCode = await runShard(options.shard, shardCount, shards[options.shard], {
      buildFirst: options.build || !process.env.WRAPT_E2E_PREBUILT,
      webDist,
    });
  } finally {
    if (ownsWebDist) await rm(webDist, { recursive: true, force: true });
  }
} else if (external) {
  process.exitCode = await runExternal();
} else {
  process.exitCode = await runAllShards(shardCount, shards);
}

function parseArguments(argv) {
  const result = { shard: undefined, shards: undefined, build: false, plan: false, rest: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--shard") result.shard = Number(argv[++index]);
    else if (argument === "--shards") result.shards = Number(argv[++index]);
    else if (argument === "--build") result.build = true;
    else if (argument === "--no-build") result.build = false;
    else if (argument === "--plan") result.plan = true;
    else if (argument === "--") { result.rest = argv.slice(index + 1); break; }
    else throw new Error(`Unbekanntes Argument: ${argument}`);
  }
  return result;
}

function configuredShardCount() {
  const raw = process.env.WRAPT_E2E_SHARDS;
  if (raw === undefined || raw.trim() === "") {
    return Math.min(6, Math.max(3, Math.floor(availableParallelism() / 4)));
  }
  const configured = Number(raw);
  if (!Number.isInteger(configured) || configured < 1) {
    throw new Error(`WRAPT_E2E_SHARDS ist ungültig: ${raw}`);
  }
  return configured;
}

async function collectSpecs() {
  const result = [];
  for (const directory of ["e2e", "tests/e2e"]) {
    let entries;
    try {
      entries = await readdir(join(repositoryRoot, directory), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".spec.ts")) continue;
      const file = `${directory}/${entry.name}`;
      if (ignoredSpecs.has(file)) continue;
      const source = await readFile(join(repositoryRoot, file), "utf8");
      const testCount = (source.match(/^\s*test(?:\.(?:skip|fixme|fail|slow|only))?\s*\(/gm) ?? []).length;
      const weight = Math.max(1, testCount) * (weightMultipliers.get(file) ?? 1);
      result.push({ file, weight });
    }
  }
  return result;
}

function assignSpecs(specs, count) {
  const buckets = Array.from({ length: count }, () => ({ load: 0, files: [] }));
  const isolatedFile = "tests/e2e/responsive-shell.spec.ts";
  const isolated = count >= 3 ? specs.find((spec) => spec.file === isolatedFile) : undefined;
  if (isolated) {
    const bucket = buckets[count - 1];
    bucket.files.push(isolated.file);
    bucket.load = isolated.weight;
  }
  const distributable = isolated ? buckets.slice(0, -1) : buckets;
  const ordered = specs
    .filter((spec) => spec.file !== isolatedFile || !isolated)
    .sort((left, right) => right.weight - left.weight || left.file.localeCompare(right.file));
  for (const spec of ordered) {
    let target = distributable[0];
    for (const bucket of distributable) if (bucket.load < target.load) target = bucket;
    target.files.push(spec.file);
    target.load += spec.weight;
  }
  for (const bucket of buckets) bucket.files.sort();
  return buckets;
}

async function runExternal() {
  const configured = process.env.WRAPT_E2E_WEB_OUT_DIR?.trim();
  const webDist = configured || await mkdtemp(join(tmpdir(), "wrapt-e2e-web-"));
  try {
    if (!configured) {
      // Auch bei einem externen Hauptserver starten Persona- und
      // Workspace-Specs eigene lokale Server. Sie brauchen den Web-Build.
      const buildCode = await buildWeb(webDist);
      if (buildCode !== 0) return buildCode;
    }
    return runPlaywright(specs.map((spec) => spec.file), { WRAPT_E2E_WEB_OUT_DIR: webDist });
  } finally {
    if (!configured) await rm(webDist, { recursive: true, force: true });
  }
}

async function runAllShards(count, buckets) {
  const webDist = await mkdtemp(join(tmpdir(), "wrapt-e2e-web-"));
  const startedAt = Date.now();
  try {
    process.stdout.write(`E2E: ${specs.length} Dateien auf ${count} Shards, Build läuft einmal.\n`);
    const buildCode = await buildWeb(webDist);
    if (buildCode !== 0) return buildCode;
    const codes = await Promise.all(buckets.map((bucket, index) => runShard(index, count, bucket, {
      buildFirst: false,
      webDist,
    })));
    const failedShard = codes.findIndex((code) => code !== 0);
    const aggregate = await aggregateResults(count, startedAt);
    if (failedShard >= 0) {
      process.stderr.write(`E2E: Shard ${failedShard + 1}/${count} ist fehlgeschlagen.\n`);
      return codes[failedShard] || 1;
    }
    return aggregate ? 0 : 1;
  } finally {
    await rm(webDist, { recursive: true, force: true });
  }
}

async function runShard(index, count, bucket, state) {
  const webDist = state.webDist ?? process.env.WRAPT_E2E_WEB_OUT_DIR?.trim();
  if (state.buildFirst) {
    if (!webDist) throw new Error("Ohne vorbereiteten Web-Build fehlt WRAPT_E2E_WEB_OUT_DIR.");
    const buildCode = await buildWeb(webDist);
    if (buildCode !== 0) return buildCode;
  }
  if (!bucket?.files.length) {
    process.stdout.write(`E2E: Shard ${index + 1}/${count} hat keine Dateien.\n`);
    return 0;
  }
  const resultsDirectory = join(repositoryRoot, "test-results", `shard-${index}`);
  const reportDirectory = join(repositoryRoot, "playwright-report", `shard-${index}`);
  const defaultWorkers = process.env.CI
    ? "4"
    : String(Math.max(1, Math.min(4, Math.floor(availableParallelism() / Math.max(1, count)))));
  const environment = {
    ...process.env,
    WRAPT_E2E_PREBUILT: "true",
    WRAPT_E2E_RESULTS_DIR: resultsDirectory,
    WRAPT_E2E_WORKERS: process.env.WRAPT_E2E_WORKERS ?? defaultWorkers,
    PLAYWRIGHT_HTML_OUTPUT_DIR: reportDirectory,
  };
  if (webDist) environment.WRAPT_E2E_WEB_OUT_DIR = webDist;
  if (!external) {
    const basePort = Number(process.env.WRAPT_E2E_PORT ?? 19310);
    if (!Number.isInteger(basePort) || basePort < 1) throw new Error("WRAPT_E2E_PORT ist ungültig.");
    environment.WRAPT_E2E_PORT = String(basePort + index * shardPortSpacing);
    // Der komplette Shard-Bereich inklusive zweitem Workspace (+300) bleibt
    // für Persona-Worker reserviert. Sonst könnte ein Persona-Block den
    // später startenden Zusatzserver überdecken.
    environment.WRAPT_E2E_RESERVED_PORT_START = String(basePort);
    environment.WRAPT_E2E_RESERVED_PORT_END = String(basePort + count * shardPortSpacing);
    // Im Shard darf das mobile Projekt ohne die komplette Chromium-Abhängigkeit
    // starten; sonst würde es alle Chromium-Tests zusätzlich in diesen Shard ziehen.
    if (count > 1) environment.WRAPT_E2E_SHARDED = "true";
  }
  process.stdout.write(`E2E: Shard ${index + 1}/${count} startet ${bucket.files.length} Dateien auf Port ${environment.WRAPT_E2E_PORT ?? "extern"}.\n`);
  return runPlaywright(bucket.files, environment);
}

async function buildWeb(webDist) {
  process.stdout.write("E2E: Build wird einmal für alle Shards erzeugt.\n");
  return runCommand(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["build:e2e"], {
    ...process.env,
    NODE_ENV: "production",
    WRAPT_E2E_WEB_OUT_DIR: webDist,
  });
}

function runPlaywright(files, environment) {
  return runCommand(process.execPath, [playwrightCli, "test", ...files, ...options.rest], {
    ...process.env,
    ...environment,
  });
}

function runCommand(command, args, environment) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", (error) => {
      process.stderr.write(`${error.message}\n`);
      resolvePromise(1);
    });
    child.once("exit", (code) => resolvePromise(code ?? 1));
  });
}

async function aggregateResults(count, startedAt) {
  const summaries = [];
  for (let index = 0; index < count; index += 1) {
    try {
      const source = await readFile(join(repositoryRoot, "test-results", `shard-${index}`, "e2e-summary.json"), "utf8");
      summaries.push(JSON.parse(source));
    } catch {
      summaries.push(null);
    }
  }
  const present = summaries.filter(Boolean);
  if (!present.length) return false;
  const configuredBudget = Number(process.env.WRAPT_E2E_FLAKY_BUDGET ?? 1);
  const flakyBudget = Number.isInteger(configuredBudget) && configuredBudget >= 0 ? configuredBudget : 1;
  const totals = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
  const byProject = {};
  const skipReasons = new Map();
  const flakes = [];
  const failures = [];
  for (const summary of present) {
    for (const key of Object.keys(totals)) totals[key] += summary.totals?.[key] ?? 0;
    for (const [project, bucket] of Object.entries(summary.byProject ?? {})) {
      const target = byProject[project] ?? { passed: 0, failed: 0, skipped: 0, flaky: 0 };
      for (const key of Object.keys(target)) target[key] += bucket[key] ?? 0;
      byProject[project] = target;
    }
    for (const entry of summary.skipReasons ?? []) {
      skipReasons.set(entry.reason, (skipReasons.get(entry.reason) ?? 0) + entry.count);
    }
    flakes.push(...(summary.flakes ?? []));
    failures.push(...(summary.failures ?? []));
  }
  const status = totals.failed > 0 || totals.flaky > flakyBudget ? "failed" : "passed";
  const result = {
    status,
    durationMs: Date.now() - startedAt,
    shards: present.length,
    flakyBudget,
    totals,
    byProject,
    skipReasons: [...skipReasons.entries()].map(([reason, count]) => ({ reason, count })).sort((left, right) => right.count - left.count),
    flakes,
    failures,
  };
  const outputDirectory = join(repositoryRoot, "test-results");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(join(outputDirectory, "e2e-summary.json"), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(join(outputDirectory, "e2e-summary.md"), renderSummary(result));
  await writeIndex(count);
  process.stdout.write(
    `\nE2E gesamt: ${totals.passed} bestanden, ${totals.failed} fehlgeschlagen, `
    + `${totals.skipped} übersprungen, ${totals.flaky} Flakes in ${Math.round(result.durationMs / 1000)} s.\n`,
  );
  return status === "passed";
}

async function writeIndex(count) {
  const reportDirectory = join(repositoryRoot, "playwright-report");
  await mkdir(reportDirectory, { recursive: true });
  const links = Array.from({ length: count }, (_, index) =>
    `<li><a href="shard-${index}/index.html">Shard ${index + 1}</a></li>`).join("");
  await writeFile(join(reportDirectory, "index.html"), `<!doctype html>
<html lang="de"><meta charset="utf-8"><title>E2E-Bericht</title>
<body style="font:16px system-ui;background:#0a0a0a;color:#eee;padding:2rem">
<h1>E2E-Bericht</h1><ul>${links}</ul></body></html>
`);
}

function renderSummary(summary) {
  const lines = [
    "# E2E-Bericht",
    "",
    `Status: ${summary.status} · Dauer: ${Math.round(summary.durationMs / 1000)} s · Shards: ${summary.shards} · Flake-Budget: ${summary.flakyBudget}`,
    "",
    "| Projekt | Bestanden | Fehlgeschlagen | Übersprungen | Flakes |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...Object.entries(summary.byProject).sort(([left], [right]) => left.localeCompare(right))
      .map(([project, bucket]) => `| ${project} | ${bucket.passed} | ${bucket.failed} | ${bucket.skipped} | ${bucket.flaky} |`),
    "",
    "## Skip-Gründe",
    "",
    ...(summary.skipReasons?.length ? summary.skipReasons.map((entry) => `- ${entry.count}× ${entry.reason}`) : ["- keine"]),
    "",
    "## Flakes (Retry-Erfolge)",
    "",
    ...(summary.flakes.length ? summary.flakes.map((flake) => `- ${flake.project}: ${flake.title} (${flake.retries} Retries)`) : ["- keine"]),
    "",
    "## Fehler",
    "",
    ...(summary.failures.length ? summary.failures.map((failure) => `- ${failure.project}: ${failure.title} — ${failure.error}`) : ["- keine"]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
