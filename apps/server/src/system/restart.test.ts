import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { bootId, readRestartStatus, RestartError, rotateRestartLogs, STALE_RESTART_MS, triggerRestart, webBuildId } from "./restart.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function sandbox() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-restart-"));
  directories.push(directory);
  const logDirectory = join(directory, "logs");
  return {
    directory,
    logDirectory,
    options: {
      logDirectory,
      statusFile: join(logDirectory, "last-status.json"),
      lockDirectory: join(logDirectory, "restart.lock"),
    },
  };
}

// Echter Spawn würde Build-Skripte starten — der Fake zahlt nur den Aufruf.
function fakeSpawn() {
  const calls: Array<readonly string[]> = [];
  const spawnImpl = ((...args: Parameters<typeof spawn>) => {
    calls.push(args[1] ?? []);
    const child = new EventEmitter() as unknown as { on: (...a: never[]) => unknown; unref: () => void };
    child.unref = () => {};
    return child;
  }) as unknown as typeof spawn;
  return { calls, spawnImpl };
}

function seedStatus(statusFile: string, overrides: Record<string, unknown> = {}) {
  mkdirSync(dirname(statusFile), { recursive: true });
  writeFileSync(statusFile, JSON.stringify({
    jobId: "00000000-0000-0000-0000-000000000000",
    phase: "running",
    target: "frontend",
    updatedAt: new Date().toISOString(),
    ...overrides,
  }));
}

describe("restart-idempotenz", () => {
  it("gibt für denselben Schlüssel dieselbe jobId zurück und startet nur einen Job", async () => {
    const { options } = await sandbox();
    const { calls, spawnImpl } = fakeSpawn();
    const key = `test-${randomUUID()}`;
    const first = triggerRestart("frontend", { ...options, idempotencyKey: key, spawnImpl });
    const second = triggerRestart("frontend", { ...options, idempotencyKey: key, spawnImpl });
    expect(second.jobId).toBe(first.jobId);
    expect(second.logFile).toBe(first.logFile);
    expect(second.deduplicated).toBe(true);
    expect(first.deduplicated).toBe(false);
    expect(calls).toHaveLength(1);
    expect(readRestartStatus(options.statusFile)).toMatchObject({ jobId: first.jobId, phase: "running" });
  });

  it("lehnt denselben Schlüssel mit anderem Ziel ab", async () => {
    const { options } = await sandbox();
    const { spawnImpl } = fakeSpawn();
    const key = `test-${randomUUID()}`;
    triggerRestart("frontend", { ...options, idempotencyKey: key, spawnImpl });
    expect(() => triggerRestart("backend", { ...options, idempotencyKey: key, spawnImpl })).toThrow(RestartError);
  });
});

describe("restart-lock", () => {
  it("blockiert bei frischem laufendem Job", async () => {
    const { options } = await sandbox();
    const { spawnImpl } = fakeSpawn();
    seedStatus(options.statusFile);
    mkdirSync(options.lockDirectory, { recursive: true });
    expect(() => triggerRestart("frontend", { ...options, spawnImpl })).toThrow(RestartError);
  });

  it("gibt einen veralteten Lock nach STALE_RESTART_MS frei", async () => {
    const { options } = await sandbox();
    const { calls, spawnImpl } = fakeSpawn();
    seedStatus(options.statusFile, { updatedAt: new Date(Date.now() - STALE_RESTART_MS - 60_000).toISOString() });
    mkdirSync(options.lockDirectory, { recursive: true });
    const started = triggerRestart("frontend", { ...options, spawnImpl });
    expect(started.jobId.length).toBeGreaterThan(0);
    expect(calls).toHaveLength(1);
    expect(readRestartStatus(options.statusFile).jobId).toBe(started.jobId);
  });
});

describe("restart-logrotation", () => {
  it("löscht Logs älter als 7 Tage und deckelt das Budget, fremde Dateien bleiben", async () => {
    const { logDirectory } = await sandbox();
    await mkdir(logDirectory, { recursive: true });
    const oldLog = join(logDirectory, "restart-frontend-1.log");
    const freshLog = join(logDirectory, "restart-frontend-2.log");
    const keepFile = join(logDirectory, "notizen.txt");
    await writeFile(oldLog, "alt");
    await writeFile(freshLog, "neu");
    await writeFile(keepFile, "bleibt");
    const ancient = new Date(Date.now() - 8 * 86_400_000);
    await utimes(oldLog, ancient, ancient);
    const aged = rotateRestartLogs(logDirectory);
    expect(aged.deleted).toBe(1);
    await expect(readFile(keepFile, "utf8")).resolves.toBe("bleibt");
    await expect(readFile(freshLog, "utf8")).resolves.toBe("neu");
    await writeFile(join(logDirectory, "restart-backend-3.log"), "x".repeat(900));
    const capped = rotateRestartLogs(logDirectory, Date.now(), 7, 100);
    expect(capped.deleted).toBeGreaterThan(0);
    expect(capped.bytes).toBeLessThanOrEqual(100);
  });

  it("bleibt ohne Verzeichnis fehlerfrei", () => {
    expect(rotateRestartLogs(join(tmpdir(), `wrapt-fehlend-${randomUUID()}`))).toEqual({ deleted: 0, bytes: 0 });
  });
});

describe("restart-statusmarker", () => {
  it("meldet bootIdChanged/webBuildIdChanged gegen die Job-Basis", async () => {
    const { options } = await sandbox();
    expect(readRestartStatus(options.statusFile)).toMatchObject({ phase: "idle", bootIdChanged: null, webBuildIdChanged: null });
    seedStatus(options.statusFile, { phase: "succeeded", baselineBootId: bootId, baselineWebBuildId: webBuildId() });
    expect(readRestartStatus(options.statusFile)).toMatchObject({ bootIdChanged: false, webBuildIdChanged: false });
    seedStatus(options.statusFile, { phase: "succeeded", baselineBootId: "fremder-prozess" });
    expect(readRestartStatus(options.statusFile)).toMatchObject({ bootIdChanged: true, webBuildIdChanged: null });
  });
});
