import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { NotesDatabase } from "./database.js";

const roots: string[] = [];
const databases: NotesDatabase[] = [];
afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function setup() {
  const root = mkdtempSync(join(tmpdir(), "notes-duplicate-"));
  roots.push(root);
  const database = new NotesDatabase(join(root, "notes.sqlite"));
  databases.push(database);
  return database;
}

it("dupliziert Inhalt, Icon, Cover, Favorit und Metadaten atomar", () => {
  const database = setup();
  const source = database.create({ title: "Original", parentId: null, favorite: true });
  const saved = database.saveContent(source.id, "# Inhalt\n\nText", source.revision).note;
  const coverAssetId = "00000000-0000-4000-8000-000000000001";
  const updated = database.update(saved.id, { icon: "📝", coverAssetId, favorite: true });
  database.knowledge.setMetadata(updated.id, { projectId: "wrapt", tags: ["Idee"] });
  const child = database.create({ title: "Unterseite", parentId: updated.id });

  const copy = database.duplicate(updated.id);
  expect(copy).toMatchObject({
    title: "Original Kopie",
    content: "# Inhalt\n\nText",
    icon: "📝",
    coverAssetId,
    parentId: null,
    favorite: true,
    archived: false,
    revision: 1,
  });
  expect(database.knowledge.metadata(copy.id)).toEqual({ projectId: "wrapt", tags: ["Idee"] });
  expect(database.get(child.id)?.parentId).toBe(updated.id);
  expect(database.list().filter((note) => note.parentId === copy.id)).toHaveLength(0);
  expect(database.knowledge.history(copy.id)).toHaveLength(0);
});
