import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, closeSync, constants, mkdirSync, openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { UpdateStatusResponse } from "@wrapt/contracts";
import { updateStatusResponseSchema } from "@wrapt/contracts";
import { execa } from "execa";
import { settings } from "../config/settings.js";
import { bootId, readRestartStatus, webBuildId } from "./restart.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const logDirectory = join(projectRoot, "data", "restart-logs");
const lockDirectory = join(logDirectory, "restart.lock");
const updateScript = join(projectRoot, "scripts", "update-and-restart.sh");

export class UpdateError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message);
    this.name = "UpdateError";
  }
}

async function runGit(args: string[], timeoutMs: number): Promise<string | null> {
  try {
    const result = await execa("git", args, {
      cwd: projectRoot,
      reject: false,
      timeout: timeoutMs,
    });
    if (result.exitCode !== 0) return null;
    return result.stdout.trim();
  } catch {
    return null;
  }
}

function shortHash(hash: string | null): string | null {
  if (!hash) return null;
  return hash.slice(0, 7);
}

function parseDirtyFiles(output: string | null): { files: string[]; count: number } {
  if (output === null || output.length === 0) return { files: [], count: 0 };
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  const files = lines
    .map((line) => line.replace(/^.{1,3}\s+/, "").split(" -> ").pop() ?? line)
    .map((file) => file.replace(/^"+|"+$/g, ""))
    .filter(Boolean);
  return { files: files.slice(0, 30), count: files.length };
}

export async function getUpdateStatus(): Promise<UpdateStatusResponse> {
  const checkedAt = new Date().toISOString();
  const branch = (await runGit(["rev-parse", "--abbrev-ref", "HEAD"], 5_000)) ?? "master";
  const localHash = await runGit(["rev-parse", "HEAD"], 5_000);
  const dirtyOutput = await runGit(["status", "--porcelain"], 5_000);
  const dirty = dirtyOutput !== null && dirtyOutput.length > 0;
  const { files: dirtyFiles, count: dirtyCount } = parseDirtyFiles(dirtyOutput);
  const remoteLine = await runGit(["ls-remote", "origin", branch], 15_000);
  const remoteHash = remoteLine ? remoteLine.split(/\s+/)[0] ?? null : null;

  let message: string;
  let updateAvailable = false;
  if (localHash === null) {
    message = "Kein Git-Stand gefunden. Prüfe, ob das Verzeichnis ein Git-Checkout ist.";
  } else if (remoteHash === null) {
    message = "GitHub ist nicht erreichbar. Später erneut versuchen.";
  } else if (remoteHash !== localHash) {
    updateAvailable = true;
    message = dirty
      ? "Update verfügbar, aber es gibt lokale Änderungen. Erst committen oder verwerfen."
      : "Update verfügbar. Installieren baut neu und startet den Dienst neu.";
  } else {
    message = dirty
      ? "Aktuell, aber es gibt lokale Änderungen."
      : "Aktuell. Kein Update verfügbar.";
  }

  return updateStatusResponseSchema.parse({
    branch,
    version: settings.appVersion,
    localHash,
    localShort: shortHash(localHash),
    remoteHash,
    remoteShort: shortHash(remoteHash),
    updateAvailable: updateAvailable && !dirty,
    dirty,
    dirtyFiles,
    dirtyCount,
    checkedAt,
    message,
  });
}

function ensureNoRestartRunning(): void {
  const status = readRestartStatus();
  if (status.phase !== "running") return;
  const updatedAt = status.updatedAt ? Date.parse(status.updatedAt) : Number.NaN;
  if (!Number.isNaN(updatedAt) && Date.now() - updatedAt < 60 * 60 * 1000) {
    throw new UpdateError(
      "Es läuft bereits ein Neustart oder Update.",
      "Warte, bis der laufende Vorgang fertig ist.",
    );
  }
}

// Startet scripts/update-and-restart.sh losgelöst. Das Skript schreibt wie die
// Neustart-Skripte nach data/restart-logs/last-status.json, damit das UI den
// Fortschritt über GET /system/restart/status pollt.
export async function triggerUpdate(): Promise<{ jobId: string; logFile: string; fromHash: string | null; toHash: string | null }> {
  const status = await getUpdateStatus();
  if (status.dirty) {
    throw new UpdateError(
      "Lokale Änderungen blockieren das Update.",
      "Änderungen committen oder verwerfen, dann erneut versuchen.",
    );
  }
  if (status.localHash === null || status.remoteHash === null) {
    throw new UpdateError(
      "Der Git-Stand konnte nicht geprüft werden.",
      status.message,
    );
  }
  if (!status.updateAvailable) {
    throw new UpdateError("Kein Update verfügbar.", "Der Stand ist bereits aktuell.");
  }
  try {
    accessSync(updateScript, constants.R_OK);
  } catch {
    throw new UpdateError(
      `Das Update-Skript fehlt: ${updateScript}`,
      "Prüfe, ob das Repository vollständig ausgecheckt ist (scripts/update-and-restart.sh).",
    );
  }
  ensureNoRestartRunning();
  mkdirSync(logDirectory, { recursive: true });
  try {
    mkdirSync(lockDirectory, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new UpdateError(
      "Es läuft bereits ein Neustart oder Update.",
      "Warte, bis der laufende Vorgang fertig ist.",
    );
  }

  const jobId = randomUUID();
  const logFile = join(logDirectory, `restart-both-${Date.now()}.log`);
  const logHandle = openSync(logFile, "a");
  let logClosed = false;
  const closeLog = () => {
    if (logClosed) return;
    logClosed = true;
    closeSync(logHandle);
  };
  const fromHash = status.localHash;
  const toHash = status.remoteHash;

  try {
    const child = spawn("/bin/bash", [updateScript], {
      cwd: projectRoot,
      detached: true,
      stdio: ["ignore", logHandle, logHandle],
      env: {
        ...process.env,
        RESTART_JOB_ID: jobId,
        RESTART_LOCK_HELD: "1",
        RESTART_LOCK_DIRECTORY: lockDirectory,
        RESTART_BASELINE_BOOT_ID: bootId,
        RESTART_BASELINE_WEB_BUILD_ID: String(webBuildId() ?? ""),
        RESTART_LOG_FILE: logFile,
        RESTART_TARGET: "both",
        UPDATE_FROM_HASH: fromHash,
        UPDATE_TO_HASH: toHash,
        WRAPT_HEALTH_URL: `http://127.0.0.1:${settings.port}`,
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}`,
      },
    });
    child.on("error", () => {
      closeLog();
    });
    child.on("exit", () => {
      closeLog();
    });
    child.unref();
  } catch (error) {
    closeLog();
    const message = error instanceof Error ? error.message : String(error);
    throw new UpdateError(`Das Update konnte nicht gestartet werden: ${message}`, "Details stehen im Log unter data/restart-logs/.");
  }

  return { jobId, logFile, fromHash, toHash };
}
