import type { z } from "zod";
import { NOTES_ARCHIVE_MAX_BYTES, notesArchiveSchema } from "@wrapt/contracts";
import { strFromU8, unzipSync } from "fflate";

export { NOTES_ARCHIVE_MAX_BYTES };
export const noteArchiveSchema = notesArchiveSchema;
export type NoteArchive = z.infer<typeof noteArchiveSchema>;
export function readArchive(bytes: Uint8Array) {
  if (bytes.length > NOTES_ARCHIVE_MAX_BYTES) throw new Error("Das Archiv darf höchstens 64 MB groß sein.");
  let total = 0;
  let count = 0;
  const files = unzipSync(bytes, { filter: (file) => {
    total += file.originalSize;
    count++;
    if (total > NOTES_ARCHIVE_MAX_BYTES || count > 2000 || file.name.split("/").includes("..") || file.name.startsWith("/")) throw new Error("Das Archiv enthält zu viele, zu große oder ungültige Dateien.");
    return !file.name.endsWith("/");
  } });
  const manifest = files["wrapt-notes.json"];
  return { files, archive: manifest ? noteArchiveSchema.parse(JSON.parse(strFromU8(manifest))) : null };
}
/** Standardlinks funktionieren außerhalb Wrapts; das Manifest erhält alle eigenen Blöcke. */
export function portableNoteMarkdown(content: string, targets: Map<string, string>): string {
  return content.replace(/\[noteMention\s+([^\]]+)\]/g, (_match, attrs: string) => {
    const id = /noteId="([^"]+)"/.exec(attrs)?.[1];
    const label = /label="([^"]+)"/.exec(attrs)?.[1] ?? "Notiz";
    return id && targets.has(id) ? `[${label.replace(/\[|\]/g, "")}](${targets.get(id)})` : label;
  });
}
export function resolveArchivePath(source: string, target: string): string | null {
  if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(target)) return null;
  let decoded: string;
  try { decoded = decodeURIComponent(target.split("#")[0]!); } catch { return null; }
  const parts = source.split("/").slice(0, -1);
  for (const part of decoded.replace(/\\/g, "/").split("/")) {
    if (part === "..") { if (!parts.length) return null; parts.pop(); }
    else if (part && part !== ".") parts.push(part);
  }
  return parts.join("/");
}
/** Ersetzt die gesamte Referenz einschließlich eines historischen Host-Präfixes. */
export function replaceMediaReference(content: string, id: string, target: string): string {
  const reference = new RegExp(`(?:https?://[^\\s)"'<>]*?)?/api/v1/media/${id}(?:\\?[^\\s)"'<>]*)?`, "gi");
  return content.replace(reference, () => target);
}
