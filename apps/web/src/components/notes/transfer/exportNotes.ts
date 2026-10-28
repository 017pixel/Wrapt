import { strToU8, zipSync } from "fflate";
import { apiClient } from "../../../lib/apiClient";
import { notesKnowledgeApi } from "../../../lib/apiClient/notesKnowledge";
import { NOTES_ARCHIVE_MAX_BYTES, portableNoteMarkdown, replaceMediaReference, type NoteArchive } from "./archiveFormat";

export async function exportNotes(): Promise<Uint8Array> {
  const source = await notesKnowledgeApi.notesArchive();
  if (!source) throw new Error("Notizen konnten nicht geladen werden.");
  const archive: NoteArchive = { ...source, assets: {} };
  const files: Record<string, Uint8Array> = {};
  const targets = new Map(source.notes.map((note) => [note.id, `${note.id}.md`]));
  let bytes = 0;
  const add = (path: string, value: Uint8Array) => {
    bytes += value.length;
    if (bytes > NOTES_ARCHIVE_MAX_BYTES) throw new Error("Der Export überschreitet 64 MB. Bitte exportiere Anhänge separat.");
    files[path] = value;
  };
  for (const summary of source.notes) {
    const result = { note: summary };
    let content = portableNoteMarkdown(result.note.content, targets);
    const assets = new Set([...content.matchAll(/\/api\/v1\/media\/([a-f\d-]{36})/gi)].map((match) => match[1]!));
    if (result.note.coverAssetId) assets.add(result.note.coverAssetId);
    for (const id of assets) {
      if (!archive.assets[id]) {
        const response = await fetch(apiClient.mediaUrl(id), { credentials: "same-origin", signal: AbortSignal.timeout(30_000) });
        if (!response.ok) throw new Error(`Anhang ${id} konnte nicht exportiert werden.`);
        const data = new Uint8Array(await response.arrayBuffer());
        const file = `assets/${id}`;
        add(file, data);
        archive.assets[id] = { file, type: response.headers.get("content-type") ?? "application/octet-stream" };
      }
      content = replaceMediaReference(content, id, `assets/${id}`);
    }
    add(`${summary.id}.md`, strToU8(`# ${summary.title}\n\n${content}`));
  }
  add("wrapt-notes.json", strToU8(JSON.stringify(archive)));
  add("Liesmich.txt", strToU8("Die Markdown-Dateien enthalten portable Seitenlinks. wrapt-notes.json erhält zusätzlich Hierarchie, Eigenschaften und Wrapt-Blöcke. Eigene Blockdirektiven sind nicht in jedem Markdown-Editor darstellbar. Externe Anhänge bleiben externe Links."));
  return zipSync(files, { level: 6 });
}
export function downloadNotes(bytes: Uint8Array) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: "application/zip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `Wrapt-Notizen-${new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
