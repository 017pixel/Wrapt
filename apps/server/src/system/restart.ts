import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { accessSync, closeSync, constants, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RestartPhase, RestartTarget } from "@wrapt/contracts";
import { settings } from "../config/settings.js";
import { supportsSystemd } from "./platform.js";

// Eindeutig pro Serverprozess. Ändert sich der Wert im /health, lief ein Backend-Neustart durch.
export const bootId = randomUUID();

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const logDirectory = join(projectRoot, "data", "restart-logs");
const statusFile = join(logDirectory, "last-status.json");
const lockDirectory = join(logDirectory, "restart.lock");

const scriptByTarget: Record<RestartTarget, string> = {
  frontend: "restart-frontend.sh",
  backend: "restart-backend.sh",
  both: "restart-all.sh",
};

// mtime der gebauten Startseite. Der Frontend-Neustart baut dist/ neu und hebt diesen Wert an.
export function webBuildId(): number | null {
  try {
    return Math.floor(statSync(join(projectRoot, "apps/web/dist/index.html")).mtimeMs);
  } catch {
    return null;
  }
}

export class RestartError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message);
    this.name = "RestartError";
  }
}

interface StatusFile {
  jobId?: string | null;
  target?: string;
  phase?: string;
  exitCode?: number | null;
  step?: string;
  message?: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  logFile?: string | null;
  baselineBootId?: string | null;
  baselineWebBuildId?: number | null;
}

export interface RestartStatus {
  jobId: string | null;
  phase: RestartPhase;
  target: RestartTarget | null;
  exitCode: number | null;
  step: string;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  logTail: string;
  logFile: string | null;
  bootIdChanged: boolean | null;
  webBuildIdChanged: boolean | null;
  baselineBootId: string | null;
  baselineWebBuildId: number | null;
}

const isRestartTarget = (value: unknown): value is RestartTarget =>
  value === "frontend" || value === "backend" || value === "both";
const isRestartPhase = (value: unknown): value is RestartPhase =>
  value === "idle" || value === "running" || value === "succeeded" || value === "failed";

// eslint-disable-next-line no-control-regex -- Farbcodes aus der Build-Ausgabe müssen weg.
const ansiPattern = /\[[0-9;]*[A-Za-z]/g;
const LOG_TAIL_BYTES = 12_000;

function readLogTail(file: string | null | undefined): string {
  if (!file) return "";
  try {
    const size = statSync(file).size;
    const bytes = Math.min(size, LOG_TAIL_BYTES);
    const buffer = Buffer.alloc(bytes);
    const handle = openSync(file, "r");
    try { readSync(handle, buffer, 0, bytes, Math.max(0, size - bytes)); } finally { closeSync(handle); }
    const raw = buffer.toString("utf8");
    const tail = size > LOG_TAIL_BYTES ? `… (gekürzt)\n${raw}` : raw;
    return tail.replace(ansiPattern, "").trimEnd();
  } catch {
    return "";
  }
}

function writeStatusFile(status: Pick<RestartStatus, "jobId" | "phase" | "target" | "exitCode" | "step" | "message" | "startedAt" | "logFile" | "baselineBootId" | "baselineWebBuildId">, file = statusFile) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2), { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, file);
  } catch {
    // Der Status ist Zusatzinfo — wenn er nicht schreibbar ist, läuft der Neustart trotzdem.
  }
}

function emptyStatus(): RestartStatus {
  return { jobId: null, phase: "idle", target: null, exitCode: null, step: "", message: "Bisher kein Neustart über diese Oberfläche.", startedAt: null, updatedAt: null, logTail: "", logFile: null, bootIdChanged: null, webBuildIdChanged: null, baselineBootId: null, baselineWebBuildId: null };
}

export function readRestartStatus(file = statusFile): RestartStatus {
  let parsed: StatusFile;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8")) as StatusFile;
  } catch {
    return emptyStatus();
  }
  // Bei einem Aufruf direkt aus der Shell steht kein Logpfad drin — dann null statt "".
  const logFile = parsed.logFile ? parsed.logFile : null;
  const baselineBootId = typeof parsed.baselineBootId === "string" && parsed.baselineBootId.length > 0 ? parsed.baselineBootId : null;
  const baselineWebBuildId = typeof parsed.baselineWebBuildId === "number" ? parsed.baselineWebBuildId : null;
  const currentWebBuildId = webBuildId();
  return {
    jobId: typeof parsed.jobId === "string" ? parsed.jobId : null,
    phase: isRestartPhase(parsed.phase) ? parsed.phase : "idle",
    target: isRestartTarget(parsed.target) ? parsed.target : null,
    exitCode: typeof parsed.exitCode === "number" ? parsed.exitCode : null,
    step: parsed.step ?? "",
    message: parsed.message ?? "",
    startedAt: parsed.startedAt ?? null,
    updatedAt: parsed.updatedAt ?? null,
    logTail: readLogTail(logFile),
    logFile,
    bootIdChanged: baselineBootId === null ? null : bootId !== baselineBootId,
    webBuildIdChanged: baselineWebBuildId === null ? null : currentWebBuildId !== baselineWebBuildId,
    baselineBootId,
    baselineWebBuildId,
  };
}

// Ein Neustart gilt als hängend, wenn sich der Status länger nicht bewegt. Die Skripte
// melden jeden Schritt per write_status (Heartbeat); 15 Minuten ohne Lebenszeichen
// heißt: tot. Gleiches Fenster in scripts/lib-restart.sh (RESTART_LOCK_STALE_SECONDS).
export const STALE_RESTART_MS = 15 * 60 * 1000;

function restartInFlight(file = statusFile): boolean {
  const status = readRestartStatus(file);
  if (status.phase !== "running") return false;
  const updatedAt = status.updatedAt ? Date.parse(status.updatedAt) : Number.NaN;
  if (Number.isNaN(updatedAt)) return false;
  return Date.now() - updatedAt < STALE_RESTART_MS;
}

function acquireRestartLock(lock = lockDirectory, file = statusFile) {
  try {
    mkdirSync(lock, { mode: 0o700 });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if (restartInFlight(file)) {
    throw new RestartError(
      "Es läuft bereits ein Neustart.",
      "Warte, bis der laufende Vorgang fertig ist — der Fortschritt steht unter Einstellungen.",
    );
  }
  // Nur ein nachweislich veralteter Job darf seinen engen Lock verlieren.
  rmSync(lock, { recursive: true, force: true });
  try {
    mkdirSync(lock, { mode: 0o700 });
  } catch {
    throw new RestartError("Der Neustart-Lock konnte nicht übernommen werden.", "Prüfe data/restart-logs/restart.lock.");
  }
}

function releaseRestartLock(lock = lockDirectory) {
  rmSync(lock, { recursive: true, force: true });
}

// Aufbewahrung der Neustart-Logs wie bei der Preview-Diagnostik: 7 Tage, max. 100 MB,
// älteste zuerst raus. Best-Effort — darf keinen Neustart blockieren (D-015).
export const RESTART_LOG_RETENTION_DAYS = 7;
export const RESTART_LOG_MAX_BYTES = 100 * 1024 * 1024;

export function rotateRestartLogs(directory = logDirectory, now = Date.now(), retentionDays = RESTART_LOG_RETENTION_DAYS, maxBytes = RESTART_LOG_MAX_BYTES): { deleted: number; bytes: number } {
  let names: string[];
  try {
    names = readdirSync(directory).filter((name) => name.startsWith("restart-") && name.endsWith(".log"));
  } catch {
    return { deleted: 0, bytes: 0 };
  }
  const cutoff = now - retentionDays * 86_400_000;
  let deleted = 0;
  const survivors: Array<{ name: string; mtime: number; size: number }> = [];
  for (const name of names) {
    try {
      const info = statSync(join(directory, name));
      if (info.mtimeMs < cutoff) {
        unlinkSync(join(directory, name));
        deleted += 1;
        continue;
      }
      survivors.push({ name, mtime: info.mtimeMs, size: info.size });
    } catch {
      // Weg ist weg — einzelne Dateien dürfen die Rotation nicht abbrechen.
    }
  }
  survivors.sort((left, right) => left.mtime - right.mtime);
  let total = survivors.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of survivors) {
    if (total <= maxBytes) break;
    try {
      unlinkSync(join(directory, entry.name));
      total -= entry.size;
      deleted += 1;
    } catch {
      break;
    }
  }
  return { deleted, bytes: total };
}

// Sichere Retries: Derselbe Client-Schlüssel (Header x-idempotency-key) liefert dieselbe
// jobId zurück, statt einen zweiten Job zu starten. Gleicher Schlüssel mit anderem Ziel
// ist ein Konflikt. Einträge verfallen nach 24 h (lazy, bei jedem Zugriff).
interface IdempotencyRecord { jobId: string; logFile: string; target: RestartTarget; createdAt: number; }
const idempotencyByKey = new Map<string, IdempotencyRecord>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeIdempotencyKey(value: unknown): string | null {
  const key = typeof value === "string" ? value.trim() : "";
  if (key.length === 0 || key.length > 128) return null;
  return key;
}

// Startet das passende Skript losgelöst vom Serverprozess. Linux übergibt den Dienst-Neustart an
// eine eigene systemd-Einheit; ein verwalteter macOS-Launcher kann den Prozess übernehmen.
// Die sichtbare Build-Ausgabe landet in data/restart-logs/.
export interface RestartTriggerOptions {
  idempotencyKey?: unknown;
  logDirectory?: string;
  statusFile?: string;
  lockDirectory?: string;
  spawnImpl?: typeof spawn;
}

export function triggerRestart(target: RestartTarget, options: RestartTriggerOptions = {}): { jobId: string; logFile: string; deduplicated: boolean } {
  const key = normalizeIdempotencyKey(options.idempotencyKey);
  if (!key) return { ...startRestart(target, options), deduplicated: false };
  const now = Date.now();
  for (const [stored, record] of idempotencyByKey) {
    if (now - record.createdAt > IDEMPOTENCY_TTL_MS) idempotencyByKey.delete(stored);
  }
  const existing = idempotencyByKey.get(key);
  if (existing) {
    if (existing.target !== target) {
      throw new RestartError(
        "Derselbe Idempotenz-Schlüssel wurde mit einem anderen Ziel wiederverwendet.",
        "Für ein anderes Ziel einen neuen x-idempotency-key senden.",
      );
    }
    return { jobId: existing.jobId, logFile: existing.logFile, deduplicated: true };
  }
  const created = startRestart(target, options);
  idempotencyByKey.set(key, { ...created, target, createdAt: now });
  return { ...created, deduplicated: false };
}

function startRestart(target: RestartTarget, options: RestartTriggerOptions): { jobId: string; logFile: string } {
  const logs = options.logDirectory ?? logDirectory;
  const status = options.statusFile ?? statusFile;
  const lock = options.lockDirectory ?? lockDirectory;
  const spawnFn: typeof spawn = options.spawnImpl ?? spawn;
  const script = join(projectRoot, "scripts", scriptByTarget[target]);
  try {
    accessSync(script, constants.R_OK);
  } catch {
    throw new RestartError(
      `Das Neustart-Skript fehlt: ${script}`,
      "Prüfe, ob das Repository vollständig ausgecheckt ist (scripts/restart-*.sh).",
    );
  }
  mkdirSync(logs, { recursive: true });
  rotateRestartLogs(logs);
  acquireRestartLock(lock, status);
  const jobId = randomUUID();
  const logFile = join(logs, `restart-${target}-${Date.now()}.log`);
  const logHandle = openSync(logFile, "a");
  let logHandleClosed = false;
  const closeLogHandle = () => {
    if (logHandleClosed) return;
    logHandleClosed = true;
    closeSync(logHandle);
  };
  const startedAt = new Date().toISOString();
  const baselineBootId: string = bootId;
  const baselineWebBuildId: number | null = webBuildId();

  // Vorab schreiben: Wenn bash gar nicht erst hochkommt, sieht das UI trotzdem einen Zustand.
  writeStatusFile({ jobId, phase: "running", target, exitCode: null, step: "Skript wird gestartet", message: "Läuft …", startedAt, logFile, baselineBootId, baselineWebBuildId }, status);

  try {
    const restartShell = process.platform === "win32"
      ? process.env.WRAPT_BASH_PATH || "bash"
      : "/bin/bash";
    const child: ChildProcess = spawnFn(restartShell, [script], {
      cwd: projectRoot,
      detached: true,
      stdio: ["ignore", logHandle, logHandle],
      env: {
        ...process.env,
        RESTART_JOB_ID: jobId,
        RESTART_LOCK_HELD: "1",
        RESTART_LOCK_DIRECTORY: lock,
        RESTART_BASELINE_BOOT_ID: baselineBootId,
        RESTART_BASELINE_WEB_BUILD_ID: baselineWebBuildId === null ? "" : String(baselineWebBuildId),
        RESTART_LOG_FILE: logFile,
        RESTART_TARGET: target,
        WRAPT_SERVER_PID: String(process.pid),
        // Die Skripte prüfen den Health-Check gegen den tatsächlichen Port (F01-07/F03-4).
        WRAPT_HEALTH_URL: `http://127.0.0.1:${settings.port}`,
        ...(supportsSystemd()
          ? { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.() ?? 1000}` }
          : {}),
      },
    });
    child.on("error", (error) => {
      closeLogHandle();
      writeStatusFile({ jobId, phase: "failed", target, exitCode: null, step: "Skriptstart", message: `Das Neustart-Skript konnte nicht gestartet werden: ${(error as Error).message}`, startedAt, logFile, baselineBootId, baselineWebBuildId }, status);
      releaseRestartLock(lock);
    });
    child.on("exit", (code) => {
      closeLogHandle();
      const current = readRestartStatus(status);
      if (code !== 0 && current.jobId === jobId && current.phase === "running") {
        writeStatusFile({ jobId, phase: "failed", target, exitCode: code ?? null, step: current.step, message: "Das Neustart-Skript wurde unerwartet beendet.", startedAt, logFile, baselineBootId, baselineWebBuildId }, status);
        releaseRestartLock(lock);
      }
    });
    child.unref();
  } catch (error) {
    closeLogHandle();
    releaseRestartLock(lock);
    const message = error instanceof Error ? error.message : String(error);
    writeStatusFile({ jobId, phase: "failed", target, exitCode: null, step: "Skriptstart", message, startedAt, logFile, baselineBootId, baselineWebBuildId }, status);
    throw new RestartError(`Der Neustart konnte nicht gestartet werden: ${message}`, "Details stehen im Log unter data/restart-logs/.");
  }

  return { jobId, logFile };
}
