import { isAbsolute, relative, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { stat } from "node:fs/promises";
import { galleryFileSchema } from "@wrapt/contracts";

/** Ausschließlich lesender Zugriff auf Medien bereits gespeicherter Notizen. */
export async function legacyMediaFile(databasePath: string, directory: string, id: string) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='orbit_assets'").get()) return null;
    const row = db.prepare(`SELECT id, filename, mime_type mimeType, bytes, created_at createdAt,
      storage_path storagePath FROM orbit_assets WHERE id=?`).get(id);
    if (!row) return null;
    const path = resolve(String(row.storagePath));
    const rel = relative(resolve(directory), path);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
    try { await stat(path); } catch { return null; }
    return { asset: galleryFileSchema.parse(row), path };
  } finally {
    db.close();
  }
}
