import { constants, createReadStream } from "node:fs";
import type { Stats } from "node:fs";
import { open } from "node:fs/promises";
import { sep } from "node:path";
import type { Readable } from "node:stream";
import { fileManagerTextPreviewResponseSchema, type FileManagerTextPreviewResponse } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { mimeTypeFor, utf8SafeCut } from "./fileSystemHelpers.js";

const DEFAULT_TEXT_PREVIEW_BYTES = 300 * 1024;

/** Liest eine zuvor geprüfte Datei als begrenzte UTF-8-Vorschau. */
export async function readTextPreview(canonical: string, details: Stats, textPreviewBytes: number): Promise<FileManagerTextPreviewResponse> {
  const limit = Math.max(4_096, textPreviewBytes || DEFAULT_TEXT_PREVIEW_BYTES);
  // Bis zu 3 Bytes über die Grenze hinaus lesen, damit ein Multibyte-Zeichen
  // an der Grenze vervollständigt oder sauber abgeschnitten werden kann.
  const readSize = Math.min(details.size, limit + 3);
  let buffer = Buffer.alloc(readSize);
  const handle = await open(canonical, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const { bytesRead } = await handle.read(buffer, 0, readSize, 0);
    buffer = buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const truncated = buffer.length > limit;
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
    name: canonical.split(sep).at(-1) ?? canonical,
    sizeBytes: details.size,
    modifiedAt: details.mtime.toISOString(),
    mimeType: mimeTypeFor(canonical),
    text,
    truncated,
    lineCount,
  });
}

/** Öffnet eine zuvor geprüfte Datei mit optionalem HTTP-Bytebereich. */
export function openMediaPreview(canonical: string, size: number, rangeHeader: string | undefined): {
  stream: Readable;
  statusCode: 200 | 206;
  headers: Record<string, string>;
} {
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
  if (!match || size === 0) {
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
