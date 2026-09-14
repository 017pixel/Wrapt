import { constants } from "node:fs";
import type { Dirent, Stats } from "node:fs";
import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, link, lstat, mkdir, open, readdir, realpath, rename, rmdir, rm, unlink } from "node:fs/promises";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { isAbsolute, join, normalize, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  fileManagerOperationResponseSchema,
  fileManagerSearchResponseSchema,
  fileManagerStateResponseSchema,
  fileManagerTextPreviewResponseSchema,
  type FileManagerState,
  type FileManagerStateResponse,
  type FilesystemEntry,
  type FileManagerTextPreviewResponse,
  type FileManagerSearchResponse,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { contained, entryFor, filesystemFailure, mimeTypeFor, sanitizeName, utf8SafeCut } from "./fileSystemHelpers.js";

export { languageForName } from "./fileSystemHelpers.js";

const DEFAULT_TEXT_PREVIEW_BYTES = 300 * 1024;
const SEARCH_LIMIT = 250;
const SEARCH_MAX_DEPTH = 6;
const SEARCH_TIMEOUT_MS = 3_000;
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", "dist", "build", ".next", ".out", ".cache", ".venv", "venv", ".turbo"]);

interface StateRow {
  id: number;
  document_json: string;
  revision: number;
  updated_at: string;
}



export class FileManagerService {
  private readonly db: DatabaseSync;

  constructor(
    readonly root: string,
    private readonly textPreviewBytes: number,
    private readonly maxUploadBytes: number,
    databasePath: string,
  ) {
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000");
    this.db.exec(`CREATE TABLE IF NOT EXISTS file_manager_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      document_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );`);
  }

  close() { this.db.close(); }

  private defaultState(): FileManagerState {
    return { currentPath: this.root, history: [], favorites: [], viewMode: "list", sortKey: "name", sortDirection: "asc" };
  }

  private requestedPath(input?: string): string {
    const value = input?.trim();
    if (!value || value === "~") return this.root;
    if (value.startsWith("~/")) return resolve(this.root, value.slice(2));
    return isAbsolute(value) ? normalize(value) : resolve(this.root, value);
  }

  /** Pfad innerhalb des Roots auflösen und auf echte Verzeichnisse/Dateien prüfen. */
  private async resolvePath(input: string, expect: "file" | "directory"): Promise<{ canonical: string; details: Stats }> {
    const requested = this.requestedPath(input);
    if (!contained(this.root, requested)) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    }
    let details: Stats;
    let canonical: string;
    try {
      details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht geöffnet werden.");
      if (expect === "directory" && !details.isDirectory()) throw new AppError(400, "FILESYSTEM_PATH_NOT_DIRECTORY", "Der angegebene Pfad ist kein Ordner.");
      if (expect === "file" && !details.isFile()) throw new AppError(400, "FILESYSTEM_PATH_NOT_FILE", "Der angegebene Pfad ist keine Datei.");
      canonical = await realpath(requested);
      await access(canonical, expect === "directory" ? constants.R_OK | constants.X_OK : constants.R_OK);
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    if (!contained(this.root, canonical) || canonical !== requested) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
    }
    return { canonical, details };
  }

  private async resolveTargetDirectory(input: string): Promise<string> {
    const requested = this.requestedPath(input);
    if (!contained(this.root, requested)) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Zielpfad liegt außerhalb des erlaubten Serverbereichs.");
    }
    let canonical: string;
    try {
      const details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht geöffnet werden.");
      if (!details.isDirectory()) throw new AppError(400, "FILESYSTEM_PATH_NOT_DIRECTORY", "Der Zielordner existiert nicht.");
      canonical = await realpath(requested);
      await access(canonical, constants.R_OK | constants.X_OK);
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    if (!contained(this.root, canonical) || canonical !== requested) {
      throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Zielpfad führt über einen nicht erlaubten Verweis.");
    }
    return canonical;
  }

  /** Textinhalt einer Datei lesen (begrenzt, mit Truncation-Marker). */
  async textPreview(input: { path: string }): Promise<FileManagerTextPreviewResponse> {
    const { canonical, details } = await this.resolvePath(input.path, "file");
    const limit = Math.max(4_096, this.textPreviewBytes || DEFAULT_TEXT_PREVIEW_BYTES);
    // Bis zu 3 Bytes über die Grenze hinaus lesen, damit ein Multibyte-Zeichen
    // an der Grenze vervollständigt oder sauber abgeschnitten werden kann.
    const readSize = Math.min(details.size, limit + 3);
    const buffer = Buffer.alloc(readSize);
    const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      await handle.read(buffer, 0, readSize, 0);
    } finally {
      await handle.close();
    }
    const truncated = details.size > limit;
    let text: string;
    if (!truncated) {
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch {
        throw new AppError(415, "FILESYSTEM_NOT_TEXT", "Diese Datei ist kein Textdokument und kann nicht als Textvorschau angezeigt werden.");
      }
    } else {
      const cut = utf8SafeCut(buffer, limit);
      if (cut < 0) {
        throw new AppError(415, "FILESYSTEM_NOT_TEXT", "Diese Datei ist kein Textdokument und kann nicht als Textvorschau angezeigt werden.");
      }
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, cut));
      } catch {
        throw new AppError(415, "FILESYSTEM_NOT_TEXT", "Diese Datei ist kein Textdokument und kann nicht als Textvorschau angezeigt werden.");
      }
    }
    const lineCount = text.split("\n").length;
    return fileManagerTextPreviewResponseSchema.parse({
      path: canonical,
      name: canonical.split(sep).at(-1) ?? input.path,
      sizeBytes: details.size,
      modifiedAt: details.mtime.toISOString(),
      mimeType: mimeTypeFor(canonical),
      text,
      truncated,
      lineCount,
    });
  }

  /** Byte-Bereich einer Datei öffnen (Range-Support für Video/Audio/PDF/Bild). */
  async openMedia(input: { path: string }, rangeHeader: string | undefined): Promise<{
    stream: Readable;
    statusCode: 200 | 206;
    headers: Record<string, string>;
  }> {
    const { canonical, details } = await this.resolvePath(input.path, "file");
    const size = details.size;
    const mime = mimeTypeFor(canonical);
    const baseHeaders: Record<string, string> = {
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
    };
    if (!rangeHeader) {
      return { stream: createReadStream(canonical), statusCode: 200, headers: { ...baseHeaders, "Content-Length": String(size) } };
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (!match) {
      throw new AppError(416, "FILESYSTEM_RANGE_INVALID", "Der angeforderte Bereich ist ungültig.", { contentRange: `bytes */${size}` });
    }
    let start: number;
    let end: number;
    if (match[1] === "" && match[2] === "") {
      throw new AppError(416, "FILESYSTEM_RANGE_INVALID", "Der angeforderte Bereich ist ungültig.", { contentRange: `bytes */${size}` });
    }
    if (match[1] === "") {
      const suffix = Number(match[2]);
      if (suffix <= 0) throw new AppError(416, "FILESYSTEM_RANGE_INVALID", "Der angeforderte Bereich ist ungültig.", { contentRange: `bytes */${size}` });
      start = Math.max(0, size - suffix);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
      if (start > end || start >= size) {
        throw new AppError(416, "FILESYSTEM_RANGE_INVALID", "Der angeforderte Bereich ist ungültig.", { contentRange: `bytes */${size}` });
      }
    }
    const chunk = end - start + 1;
    return {
      stream: createReadStream(canonical, { start, end }),
      statusCode: 206,
      headers: {
        ...baseHeaders,
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(chunk),
      },
    };
  }

  async download(input: { path: string }): Promise<{ stream: Readable; name: string; size: number; mime: string }> {
    const { canonical, details } = await this.resolvePath(input.path, "file");
    return {
      stream: createReadStream(canonical),
      name: canonical.split(sep).at(-1) ?? "datei",
      size: details.size,
      mime: mimeTypeFor(canonical),
    };
  }

  async rename(input: { path: string; name: string }): Promise<string> {
    const requested = this.requestedPath(input.path);
    if (!contained(this.root, requested)) throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    const name = sanitizeName(input.name);
    let parentCanonical: string;
    try {
      const details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht umbenannt werden.");
      const parent = join(requested, "..");
      parentCanonical = await realpath(parent);
      const canonical = await realpath(requested);
      if (!contained(this.root, canonical) || canonical !== requested) {
        throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
      }
      if (!contained(this.root, parentCanonical)) {
        throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    const target = join(parentCanonical, name);
    if (requested === target) throw new AppError(400, "FILESYSTEM_SAME_NAME", "Der Name ist unverändert.");
    await this.moveNoReplace(requested, target);
    return target;
  }

  async move(input: { path: string; targetDirectory: string }): Promise<string> {
    const requested = this.requestedPath(input.path);
    if (!contained(this.root, requested)) throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    const targetDirectory = await this.resolveTargetDirectory(input.targetDirectory);
    let canonical: string;
    try {
      const details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht verschoben werden.");
      canonical = await realpath(requested);
      if (!contained(this.root, canonical) || canonical !== requested) {
        throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    const name = canonical.split(sep).at(-1) ?? "datei";
    const target = join(targetDirectory, name);
    if (target === canonical) throw new AppError(400, "FILESYSTEM_SAME_DIRECTORY", "Die Datei befindet sich bereits in diesem Ordner.");
    if (target.startsWith(`${canonical}${sep}`)) {
      throw new AppError(400, "FILESYSTEM_MOVE_INTO_SELF", "Ein Ordner kann nicht in sich selbst verschoben werden.");
    }
    await this.moveNoReplace(requested, target);
    return target;
  }

  async remove(input: { path: string }): Promise<string> {
    const requested = this.requestedPath(input.path);
    if (!contained(this.root, requested)) throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad liegt außerhalb des erlaubten Serverbereichs.");
    let canonical: string;
    let details: Stats;
    try {
      details = await lstat(requested);
      if (details.isSymbolicLink()) throw new AppError(400, "FILESYSTEM_SYMLINK_FORBIDDEN", "Symbolische Verweise können nicht gelöscht werden.");
      canonical = await realpath(requested);
      if (!contained(this.root, canonical) || canonical !== requested) {
        throw new AppError(403, "FILESYSTEM_PATH_OUTSIDE_ROOT", "Der Pfad führt über einen nicht erlaubten Verweis.");
      }
      if (canonical === this.root) throw new AppError(400, "FILESYSTEM_ROOT_PROTECTED", "Der Home-Ordner selbst kann nicht gelöscht werden.");
    } catch (error) {
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    if (details.isDirectory()) {
      // rmdir ist atomar: ein zwischen Prüfung und Löschung neu befüllter
      // Ordner endet als ENOTEMPTY-Konflikt statt als stiller Datenverlust.
      try { await rmdir(canonical); } catch (error) { filesystemFailure(error); }
    } else {
      try { await unlink(canonical); } catch (error) { filesystemFailure(error); }
    }
    return canonical;
  }

  async mkdir(input: { path: string; name: string }): Promise<string> {
    const directory = await this.resolveTargetDirectory(input.path);
    const name = sanitizeName(input.name);
    const target = join(directory, name);
    try {
      await lstat(target);
      throw new AppError(409, "FILE_EXISTS", "Ein Eintrag mit diesem Namen existiert bereits.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    try {
      await mkdir(target);
    } catch (error) {
      filesystemFailure(error);
    }
    return target;
  }

  /** Upload in den angegebenen Ordner. Streamt mit Größenlimit, kein Überschreiben. */
  async upload(input: { directory: string; filename: string; stream: Readable; byteLimit?: number }): Promise<FilesystemEntry> {
    const directory = await this.resolveTargetDirectory(input.directory);
    const name = sanitizeName(input.filename);
    const target = join(directory, name);
    try {
      await lstat(target);
      throw new AppError(409, "FILE_EXISTS", "Eine Datei mit diesem Namen existiert bereits im Zielordner.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const byteLimit = input.byteLimit ?? this.maxUploadBytes;
    const temporary = join(directory, `.wrapt-upload-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tmp`);
    let bytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > byteLimit) {
          callback(new AppError(413, "FILE_TOO_LARGE", "Die Datei überschreitet das Upload-Limit.", { limitBytes: byteLimit }));
          return;
        }
        callback(null, chunk);
      },
    });
    try {
      await pipeline(input.stream, counter, createWriteStream(temporary, { flags: "wx", mode: 0o600 }));
      await this.pushFileNoReplace(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      if (error instanceof AppError) throw error;
      filesystemFailure(error);
    }
    const entry = await entryFor(target, name);
    return entry;
  }

  /**
   * Veröffentlicht eine temporäre Datei atomar, ohne ein inzwischen entstandenes
   * Ziel zu überschreiben. Hardlink + Unlink ersetzt das prüfende Rename; auf
   * Dateisystemen ohne Hardlinks wird exklusiv kopiert.
   */
  private async pushFileNoReplace(temporary: string, target: string): Promise<void> {
    try {
      await link(temporary, target);
      await unlink(temporary).catch(() => undefined);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") throw new AppError(409, "FILE_EXISTS", "Ein Eintrag mit diesem Namen existiert bereits.");
      if (code !== "EPERM" && code !== "EOPNOTSUPP" && code !== "ENOSYS" && code !== "EXDEV") filesystemFailure(error);
    }
    try {
      await copyFile(temporary, target, constants.COPYFILE_EXCL);
    } catch (error) {
      filesystemFailure(error);
    }
    await unlink(temporary).catch(() => undefined);
  }

  /**
   * Verschiebt Dateien atomar per Hardlink und Ordner über eine exklusive
   * Reservierung, sodass kein vorhandenes Ziel überschrieben wird.
   */
  private async moveNoReplace(source: string, target: string): Promise<void> {
    let details: Stats;
    try { details = await lstat(source); } catch (error) { filesystemFailure(error); }
    if (!details.isDirectory()) {
      await this.pushFileNoReplace(source, target);
      return;
    }
    try {
      await mkdir(target, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new AppError(409, "FILE_EXISTS", "Im Zielordner existiert bereits ein Eintrag mit diesem Namen.");
      }
      filesystemFailure(error);
    }
    try {
      await rmdir(target);
      await rename(source, target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST" || code === "ENOTEMPTY") {
        throw new AppError(409, "FILE_EXISTS", "Im Zielordner existiert bereits ein Eintrag mit diesem Namen.");
      }
      filesystemFailure(error);
    }
  }

  /** Namenssuche rekursiv mit Tiefen-, Treffer- und Zeitlimit. */
  async search(query: string): Promise<FileManagerSearchResponse> {
    const needle = query.trim().toLocaleLowerCase("de");
    if (!needle) throw new AppError(400, "FILESYSTEM_SEARCH_EMPTY", "Die Suche darf nicht leer sein.");
    const entries: FilesystemEntry[] = [];
    const deadline = Date.now() + SEARCH_TIMEOUT_MS;
    let truncated = false;

    const walk = async (directory: string, depth: number): Promise<void> => {
      if (truncated || entries.length >= SEARCH_LIMIT || Date.now() > deadline) { truncated = true; return; }
      if (depth > SEARCH_MAX_DEPTH) return;
      let dirents: Dirent[];
      try {
        dirents = await readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }
      dirents.sort((left, right) => left.name.localeCompare(right.name, "de", { sensitivity: "base" }));
      for (const dirent of dirents) {
        if (truncated || entries.length >= SEARCH_LIMIT || Date.now() > deadline) { truncated = true; return; }
        if (dirent.isDirectory() && SKIPPED_DIRECTORIES.has(dirent.name)) continue;
        const path = join(directory, dirent.name);
        if (dirent.name.toLocaleLowerCase("de").includes(needle) && entries.length < SEARCH_LIMIT) {
          try {
            entries.push(await entryFor(path, dirent.name));
          } catch {
            /* nicht lesbare Einträge werden übersprungen */
          }
        }
        if (dirent.isDirectory()) await walk(path, depth + 1);
      }
    };

    await walk(this.root, 0);
    if (entries.length >= SEARCH_LIMIT || truncated) truncated = true;
    return fileManagerSearchResponseSchema.parse({ query: query.trim(), root: this.root, entries, truncated });
  }

  // --- Serverseitiger Zustand (Verlauf, Favoriten, Ansicht) -----------------

  private readState(): { document: FileManagerState; revision: number; updatedAt: string } {
    const row = this.db.prepare("SELECT id, document_json, revision, updated_at FROM file_manager_state WHERE id = 1").get() as StateRow | undefined;
    if (!row) return { document: this.defaultState(), revision: 0, updatedAt: new Date(0).toISOString() };
    return { document: JSON.parse(row.document_json) as FileManagerState, revision: row.revision, updatedAt: row.updated_at };
  }

  state(): FileManagerStateResponse {
    const { document, revision, updatedAt } = this.readState();
    return fileManagerStateResponseSchema.parse({ document, revision, updatedAt });
  }

  async saveState(input: { document: FileManagerState; expectedRevision: number | null }): Promise<FileManagerStateResponse> {
    let revision: number;
    let updatedAt: string;
    let committed = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
    } catch (error) {
      if (String((error as Error).message).includes("SQLITE_BUSY")) {
        throw new AppError(409, "FILE_MANAGER_STATE_BUSY", "Der Dateimanager-Zustand wird gerade von einem anderen Schreiber geändert.", { revision: null }, true);
      }
      throw error;
    }
    try {
      // Revision lesen und schreiben müssen unter derselben Schreibsperre
      // laufen. Sonst können zwei Schreiber denselben Stand lesen und der
      // spätere Save überschreibt die Änderung des ersten (Lost Update).
      const current = this.readState();
      const matches = input.expectedRevision === null ? current.revision === 0 : input.expectedRevision === current.revision;
      if (!matches) {
        throw new AppError(409, "FILE_MANAGER_STATE_CONFLICT", "Der Dateimanager-Zustand wurde parallel geändert. Bitte neu laden.", {
          revision: current.revision,
        });
      }
      revision = current.revision + 1;
      updatedAt = new Date().toISOString();
      this.db.prepare(
        `INSERT INTO file_manager_state (id, document_json, revision, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json, revision = excluded.revision, updated_at = excluded.updated_at`,
      ).run(JSON.stringify(input.document), revision, updatedAt);
      this.db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    return fileManagerStateResponseSchema.parse({ document: input.document, revision, updatedAt });
  }

  /** Standardantwort für die Antwort-Form der Operationen. */
  response(path: string) {
    return fileManagerOperationResponseSchema.parse({ path, ok: true });
  }
}
