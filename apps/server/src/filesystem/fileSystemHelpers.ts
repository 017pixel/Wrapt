import { constants } from "node:fs";
import { access, lstat } from "node:fs/promises";
import { isAbsolute, relative, sep } from "node:path";
import type { FilesystemEntry } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

export function contained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

export function filesystemFailure(error: unknown): never {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") throw new AppError(404, "FILESYSTEM_PATH_NOT_FOUND", "Der angegebene Pfad wurde nicht gefunden.");
  if (code === "EACCES" || code === "EPERM") throw new AppError(403, "FILESYSTEM_PATH_INACCESSIBLE", "Der angegebene Pfad ist nicht lesbar.");
  if (code === "EEXIST") throw new AppError(409, "FILE_EXISTS", "Ein Eintrag mit diesem Namen existiert bereits.");
  if (code === "ENOTEMPTY") throw new AppError(409, "FILESYSTEM_DIRECTORY_NOT_EMPTY", "Der Ordner ist nicht leer und kann nicht gelöscht werden.");
  if (code === "EXDEV") throw new AppError(400, "FILESYSTEM_CROSS_DEVICE", "Ein Verschieben über Dateisystemgrenzen wird nicht unterstützt.");
  throw error;
}

const MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain", ".md": "text/markdown", ".markdown": "text/markdown", ".log": "text/plain",
  ".json": "application/json", ".jsonc": "application/json", ".yaml": "text/yaml", ".yml": "text/yaml",
  ".html": "text/html", ".htm": "text/html", ".xml": "text/xml", ".svg": "image/svg+xml",
  ".css": "text/css", ".scss": "text/scss", ".less": "text/less",
  ".js": "text/javascript", ".mjs": "text/javascript", ".cjs": "text/javascript", ".jsx": "text/javascript",
  ".ts": "text/typescript", ".mts": "text/typescript", ".cts": "text/typescript", ".tsx": "text/typescript",
  ".py": "text/x-python", ".rb": "text/x-ruby", ".php": "text/x-php", ".sh": "text/x-shellscript",
  ".bash": "text/x-shellscript", ".zsh": "text/x-shellscript", ".sql": "text/x-sql",
  ".java": "text/x-java", ".go": "text/x-go", ".rs": "text/x-rust", ".c": "text/x-c", ".h": "text/x-c",
  ".cpp": "text/x-cpp", ".hpp": "text/x-cpp", ".cs": "text/x-csharp", ".swift": "text/x-swift",
  ".kt": "text/x-kotlin", ".kts": "text/x-kotlin", ".toml": "text/toml", ".ini": "text/plain",
  ".env": "text/plain", ".gitignore": "text/plain", ".dockerignore": "text/plain", ".npmrc": "text/plain",
  ".csv": "text/csv", ".diff": "text/x-diff", ".patch": "text/x-diff",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".bmp": "image/bmp",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
  ".oga": "audio/ogg", ".flac": "audio/flac", ".m4a": "audio/mp4", ".opus": "audio/opus",
  ".pdf": "application/pdf", ".zip": "application/zip", ".tar": "application/x-tar",
  ".gz": "application/gzip", ".tgz": "application/gzip", ".7z": "application/x-7z-compressed",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
};

export function mimeTypeFor(name: string): string {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  return MIME_TYPES[extension] ?? "application/octet-stream";
}

export function languageForName(name: string): string | null {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const languages: Record<string, string> = {
    ".ts": "typescript", ".mts": "typescript", ".cts": "typescript", ".tsx": "tsx",
    ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "jsx",
    ".json": "json", ".jsonc": "json", ".css": "css", ".scss": "scss", ".less": "less",
    ".html": "xml", ".htm": "xml", ".svg": "xml", ".xml": "xml",
    ".md": "markdown", ".markdown": "markdown",
    ".py": "python", ".sh": "bash", ".bash": "bash", ".zsh": "bash",
    ".sql": "sql", ".yaml": "yaml", ".yml": "yaml", ".toml": "ini", ".ini": "ini",
    ".java": "java", ".go": "go", ".rs": "rust", ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp",
    ".cs": "csharp", ".rb": "ruby", ".php": "php", ".swift": "swift", ".kt": "kotlin",
    ".diff": "diff", ".patch": "diff", ".dockerfile": "dockerfile",
  };
  if (name.toLowerCase() === "dockerfile") return "dockerfile";
  return languages[extension] ?? null;
}

export function sanitizeName(value: string): string {
  return value.replace(/[\\/\0]/g, "_").trim().slice(0, 255) || "datei";
}

/**
 * Länge des längsten gültigen UTF-8-Präfixes eines Buffers mit höchstens
 * `maxBytes` Bytes. Eine abgeschnittene Multibyte-Sequenz am Ende wird komplett
 * entfernt, damit eine Textdatei nicht fälschlich als Binärdaten gilt, nur weil
 * die Vorschau-Grenze mitten durch ein Zeichen läuft. Rückgabe -1, wenn der
 * Präfix offensichtlich ungültige Byte-Sequenzen enthält.
 */
export function utf8SafeCut(buffer: Buffer, maxBytes: number): number {
  const available = buffer.length;
  if (available === 0) return 0;
  let cursor = available - 1;
  let continuationBytes = 0;
  while (cursor >= 0 && continuationBytes < 4 && (buffer[cursor]! & 0xc0) === 0x80) {
    cursor -= 1;
    continuationBytes += 1;
  }
  if (cursor < 0) return -1;
  const lead = buffer[cursor]!;
  let expectedLength: number;
  if (lead < 0x80) {
    if (continuationBytes === 0) return Math.min(maxBytes, available);
    return -1;
  }
  if ((lead & 0xe0) === 0xc0) expectedLength = lead >= 0xc2 ? 2 : 0;
  else if ((lead & 0xf0) === 0xe0) expectedLength = 3;
  else if ((lead & 0xf8) === 0xf0) expectedLength = lead <= 0xf4 ? 4 : 0;
  else expectedLength = 0;
  if (expectedLength === 0) return -1;
  if (continuationBytes > expectedLength - 1) return -1;
  if (continuationBytes < expectedLength - 1) {
    // Sequenz im Puffer unvollständig. Beginnt sie vor der Grenze, ist die Datei
    // wirklich kaputt; beginnt sie dahinter, wird sie einfach verworfen.
    return cursor < maxBytes ? -1 : Math.min(maxBytes, cursor);
  }
  // Vollständige Sequenz. Beginnt sie jenseits der Grenze, wird sie verworfen;
  // beginnt sie davor, aber sie endet dahinter, wird sie vervollständigt.
  if (cursor >= maxBytes) return maxBytes;
  const sequenceEnd = cursor + expectedLength;
  if (sequenceEnd > maxBytes && sequenceEnd <= available) return sequenceEnd;
  return maxBytes;
}

export async function entryFor(path: string, name: string): Promise<FilesystemEntry> {
  const details = await lstat(path);
  if (details.isSymbolicLink()) return { name, path, kind: "symlink", sizeBytes: null, modifiedAt: null, readable: false };
  const kindValue: FilesystemEntry["kind"] = details.isDirectory() ? "directory" : details.isFile() ? "file" : "other";
  try {
    await access(path, kindValue === "directory" ? constants.R_OK | constants.X_OK : constants.R_OK);
    return {
      name,
      path,
      kind: kindValue,
      sizeBytes: kindValue === "file" ? details.size : null,
      modifiedAt: details.mtime.toISOString(),
      readable: true,
    };
  } catch {
    return { name, path, kind: kindValue, sizeBytes: null, modifiedAt: null, readable: false };
  }
}
