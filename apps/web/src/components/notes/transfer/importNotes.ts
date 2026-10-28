import { strFromU8 } from "fflate";
import type { Note } from "@wrapt/contracts";
import { NOTE_CONTENT_MAX_CHARACTERS } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";
import { notesKnowledgeApi } from "../../../lib/apiClient/notesKnowledge";
import { NOTES_ARCHIVE_MAX_BYTES, readArchive, replaceMediaReference, resolveArchivePath, type NoteArchive } from "./archiveFormat";
interface ImportPage { path: string; note: Note }
export interface ImportReport { created: number; warnings: string[] }
function markdownNote(title: string, content: string): Note {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title: title.slice(0, 300) || "Importierte Notiz", content, revision: 1, parentId: null, folderId: null,
    icon: null, coverAssetId: null, sortOrder: 0, favorite: false, archived: false, createdAt: now, updatedAt: now };
}
export async function importNotes(file: File): Promise<ImportReport> {
  if (file.size > NOTES_ARCHIVE_MAX_BYTES) throw new Error("Der Import darf höchstens 64 MB groß sein.");
  const warnings: string[] = [];
  const files: Record<string, Uint8Array> = {};
  let source: NoteArchive | null = null;
  if (/\.zip$/i.test(file.name)) {
    const unpacked = readArchive(new Uint8Array(await file.arrayBuffer()));
    Object.assign(files, unpacked.files); source = unpacked.archive;
  } else if (/\.md$/i.test(file.name)) files[file.name] = new Uint8Array(await file.arrayBuffer());
  else throw new Error("Bitte eine Markdown-Datei oder einen ZIP-Export von Wrapt, Obsidian oder Notion auswählen.");
  const pages: ImportPage[] = source ? source.notes.map((note) => ({ path: `${note.id}.md`, note: { ...note } }))
    : Object.entries(files).filter(([name]) => /\.md$/i.test(name)).map(([path, bytes]) => {
      const content = strFromU8(bytes);
      const heading = /^#\s+(.+)\r?$/m.exec(content)?.[1];
      const title = heading ?? path.split("/").at(-1)!.replace(/\.md$/i, "");
      return { path, note: markdownNote(title, heading ? content.replace(/^#\s+.+\r?\n?/, "") : content) };
    });
  if (!pages.length || pages.length > 1000) throw new Error("Bitte ein Archiv mit 1 bis 1.000 Markdown-Notizen auswählen.");
  if (pages.some((page) => page.note.content.length > NOTE_CONTENT_MAX_CHARACTERS)) throw new Error("Eine Notiz überschreitet die erlaubte Größe.");
  const unsupported = Object.keys(files).filter((path) => /\.(csv|html)$/i.test(path));
  if (unsupported.length) warnings.push(`${unsupported.length} CSV-/HTML-Dateien wurden nicht umgewandelt. Notion-Datenbanken und HTML-Sonderblöcke müssen separat übernommen werden.`);
  const byPath = new Map(pages.map((page) => [page.path, page.note]));
  const assets = new Map<string, string>();
  const upload = async (path: string, type = "application/octet-stream") => {
    if (assets.has(path)) return assets.get(path)!;
    const bytes = files[path];
    if (!bytes) { warnings.push(`Anhang fehlt: ${path}`); return path; }
    const asset = await apiClient.uploadMedia(new File([new Uint8Array(bytes).buffer], path.split("/").at(-1)!, { type }));
    const url = apiClient.mediaUrl(asset.id); assets.set(path, url); return url;
  };
  for (const page of pages) {
    let content = page.note.content;
    if (source) {
      const ids = new Set([...content.matchAll(/\/api\/v1\/media\/([a-f\d-]{36})/gi)].map((match) => match[1]!));
      for (const id of ids) {
        const asset = source.assets[id];
        if (asset) content = replaceMediaReference(content, id, await upload(asset.file, asset.type));
      }
      const cover = page.note.coverAssetId && source.assets[page.note.coverAssetId];
      if (cover) page.note.coverAssetId = (await upload(cover.file, cover.type)).split("/").at(-1) ?? null;
    } else {
      // Neue virtuelle IDs werden erst im atomaren Serverimport endgültig zugewiesen.
      for (const match of [...content.matchAll(/(!?)\[([^\]]*)\]\(([^)]+)\)/g)]) {
        const path = resolveArchivePath(page.path, match[3]!);
        if (!path) continue;
        const linked = byPath.get(path);
        if (linked && match[1] !== "!") content = content.replace(match[0], `[noteMention noteId="${linked.id}" label="${linked.title.replaceAll('"', "'")}"]`);
        else if (files[path]) content = content.replace(match[0], `${match[1]}[${match[2]}](${await upload(path)})`);
      }
      content = content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (all, target: string, label?: string) => {
        const path = resolveArchivePath(page.path, /\.md$/i.test(target) ? target : `${target}.md`);
        const linked = path ? byPath.get(path) : undefined;
        return linked ? `[noteMention noteId="${linked.id}" label="${(label ?? linked.title).replaceAll('"', "'")}"]` : all;
      });
    }
    page.note.content = content;
  }
  const archive: NoteArchive = { version: 1, notes: pages.map((page) => page.note), folders: source?.folders ?? [], metadata: source?.metadata ?? {}, assets: {} };
  const response = await notesKnowledgeApi.importNotesArchive(archive);
  if (!response) throw new Error("Der Import konnte nicht gespeichert werden. Vorhandene Notizen wurden nicht verändert.");
  return { created: response.created, warnings: [...new Set(warnings)] };
}
