import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { NotesDatabase } from "./database.js";
import { normalizeLegacyMediaLinks } from "./legacyMediaLinks.js";

const assetId = "00000000-0000-4000-8000-000000000001";
const oldPath = `/api/v1/orbit/assets/${assetId}`;
const newPath = `/api/v1/media/${assetId}`;

it("normalisiert Markdown-Bildlinks, Dateilinks und Referenzen ohne fremde Links zu verändern", () => {
  const content = `![Bild](${oldPath})\n[Datei](<${oldPath}?download=1>)\n![Bild](https://wrapt.example${oldPath} "Bild")\n[bild]: ${oldPath}\n[extern](https://example.com/bild.png)\nUnverknüpfter Text: ${oldPath}`;
  expect(normalizeLegacyMediaLinks(content)).toBe(
    `![Bild](${newPath})\n[Datei](<${newPath}?download=1>)\n![Bild](https://wrapt.example${newPath} "Bild")\n[bild]: ${newPath}\n[extern](https://example.com/bild.png)\nUnverknüpfter Text: ${oldPath}`,
  );
});

it("liefert bestehende Notizbilder mit neutraler URL und lässt Inhalt und Revision in SQLite unverändert", async () => {
  const root = await mkdtemp(join(tmpdir(), "wrapt-notes-media-"));
  const path = join(root, "notes.sqlite");
  const notes = new NotesDatabase(path);
  const raw = new DatabaseSync(path);
  try {
    const note = notes.create({ title: "Bestehendes Bild", parentId: null });
    const content = `![Bild](${oldPath})`;
    raw.prepare("UPDATE notes SET content=? WHERE id=?").run(content, note.id);
    const before = raw.prepare("SELECT content, revision, updated_at FROM notes WHERE id=?").get(note.id);
    expect(notes.get(note.id)).toMatchObject({ content: `![Bild](${newPath})`, revision: note.revision });
    expect(raw.prepare("SELECT content, revision, updated_at FROM notes WHERE id=?").get(note.id)).toEqual(before);
  } finally {
    raw.close();
    notes.close();
    await rm(root, { recursive: true, force: true });
  }
});
