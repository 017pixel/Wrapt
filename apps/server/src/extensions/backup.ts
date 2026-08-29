import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
interface SerializableDatabase {
  serialize(): Uint8Array;
}

const FORMAT_VERSION = 1;
const backupName = /^extension-registry-r(\d{12})\.sqlite$/;

interface BackupManifest {
  formatVersion: 1;
  revision: number;
  file: string;
  bytes: number;
  sha256: string;
}

export interface ExtensionBackupStatus {
  available: boolean;
  revision: number;
  lastError: string | null;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function backupFile(revision: number): string {
  return `extension-registry-r${String(revision).padStart(12, "0")}.sqlite`;
}

function versionedManifestFile(file: string): string {
  return `${file}.json`;
}

function syncDirectory(directory: string): void {
  const handle = openSync(directory, "r");
  try {
    fsyncSync(handle);
  } finally {
    closeSync(handle);
  }
}

function manifestFrom(bytes: Uint8Array, revision: number, file: string): BackupManifest {
  return {
    formatVersion: FORMAT_VERSION,
    revision,
    file,
    bytes: bytes.byteLength,
    sha256: digest(bytes),
  };
}

export function writeExtensionDatabaseBackup(
  database: SerializableDatabase,
  directory: string,
  revision: number,
): ExtensionBackupStatus {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const bytes = Buffer.from(database.serialize());
  const file = backupFile(revision);
  const snapshotPath = join(directory, file);
  const manifest = manifestFrom(bytes, revision, file);
  const manifestPath = join(directory, "current.json");
  const versionedManifestPath = join(directory, versionedManifestFile(file));
  const temporaryManifest = join(directory, `.current-${process.pid}-${revision}.tmp`);

  if (!existsSync(snapshotPath)) {
    writeFileSync(snapshotPath, bytes, { mode: 0o600, flag: "wx", flush: true });
  }
  if (!existsSync(versionedManifestPath)) {
    writeFileSync(versionedManifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600, flag: "wx", flush: true });
  }
  writeFileSync(temporaryManifest, `${JSON.stringify(manifest)}\n`, { mode: 0o600, flush: true });
  renameSync(temporaryManifest, manifestPath);
  syncDirectory(directory);
  return { available: true, revision, lastError: null };
}

function parseManifest(path: string, directory: string): { manifest: BackupManifest; bytes: Buffer } | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<BackupManifest>;
    const revision = value.revision;
    if (
      value.formatVersion !== FORMAT_VERSION
      || typeof revision !== "number"
      || !Number.isSafeInteger(revision)
      || revision < 0
      || typeof value.file !== "string"
      || !backupName.test(value.file)
      || typeof value.bytes !== "number"
      || !Number.isSafeInteger(value.bytes)
      || value.bytes < 0
      || typeof value.sha256 !== "string"
      || !/^[a-f0-9]{64}$/.test(value.sha256)
    ) return null;
    const bytes = readFileSync(join(directory, value.file));
    if (bytes.byteLength !== value.bytes || digest(bytes) !== value.sha256) return null;
    return {
      manifest: {
        formatVersion: FORMAT_VERSION,
        revision,
        file: value.file,
        bytes: value.bytes,
        sha256: value.sha256,
      },
      bytes,
    };
  } catch {
    return null;
  }
}

function parseVersionedSnapshot(path: string, directory: string): { manifest: BackupManifest; bytes: Buffer } | null {
  const match = backupName.exec(path.split("/").at(-1) ?? "");
  if (match === null) return null;
  return parseManifest(join(directory, versionedManifestFile(match[0])), directory);
}

function backupCandidates(directory: string): string[] {
  const current = join(directory, "current.json");
  const versioned = readdirSync(directory)
    .filter((name) => backupName.test(name))
    .sort()
    .reverse()
    .map((name) => join(directory, name));
  return [...(existsSync(current) ? [current] : []), ...versioned];
}

export function restoreExtensionDatabaseBackup(
  databasePath: string,
  directory: string,
): ExtensionBackupStatus {
  if (!existsSync(directory)) return { available: false, revision: 0, lastError: null };
  const candidates = backupCandidates(directory);
  const parsed = candidates
    .map((candidate) => candidate.endsWith("current.json")
      ? parseManifest(candidate, directory)
      : parseVersionedSnapshot(candidate, directory))
    .find((candidate): candidate is { manifest: BackupManifest; bytes: Buffer } => candidate !== null);
  if (parsed === undefined) {
    return candidates.length === 0
      ? { available: false, revision: 0, lastError: null }
      : { available: false, revision: 0, lastError: "Keine gültige Extension-Registry-Sicherung gefunden." };
  }
  mkdirSync(dirname(databasePath), { recursive: true });
  const temporaryPath = join(dirname(databasePath), `.extension-restore-${process.pid}.tmp`);
  writeFileSync(temporaryPath, parsed.bytes, { mode: 0o600, flush: true });
  renameSync(temporaryPath, databasePath);
  return { available: true, revision: parsed.manifest.revision, lastError: null };
}

export function extensionDatabaseBackupStatus(directory: string): ExtensionBackupStatus {
  if (!existsSync(directory)) return emptyExtensionBackupStatus();
  const parsed = backupCandidates(directory)
    .map((candidate) => candidate.endsWith("current.json")
      ? parseManifest(candidate, directory)
      : parseVersionedSnapshot(candidate, directory))
    .find((candidate): candidate is { manifest: BackupManifest; bytes: Buffer } => candidate !== null);
  return parsed === undefined
    ? { available: false, revision: 0, lastError: "Keine gültige Extension-Registry-Sicherung gefunden." }
    : { available: true, revision: parsed.manifest.revision, lastError: null };
}

export function emptyExtensionBackupStatus(): ExtensionBackupStatus {
  return { available: false, revision: 0, lastError: null };
}
