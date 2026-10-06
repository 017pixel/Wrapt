import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { NotesDatabase } from "./database.js";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "wrapt-note-folders-"));
  const path = join(root, "notes.sqlite");
  cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const db = new NotesDatabase(path);
  cleanups.push(() => db.close());
  return { db, path };
}

it("speichert Ordner und Lieblingsseiten über eine zweite Datenbankverbindung", () => {
  const { db, path } = fixture();
  const folder = db.folders.create("Gedanken");
  const note = db.create({ title: "Idee", parentId: null, folderId: folder.id, favorite: true });
  const reopened = new NotesDatabase(path);
  cleanups.push(() => reopened.close());
  expect(reopened.folders.list()).toEqual([folder]);
  expect(reopened.get(note.id)).toMatchObject({ folderId: folder.id, favorite: true });
  expect(reopened.list()[0]?.folderId).toBe(folder.id);
  expect(reopened.search({ q: "Idee", titleOnly: true, createdWithin: "any", updatedWithin: "any" })[0]?.folderId).toBe(folder.id);
});

it("löst einen Ordner auf und erhält Seiten, Inhalte und Unterseiten", () => {
  const { db } = fixture();
  const folder = db.folders.create("Entwürfe");
  const page = db.create({ title: "Seite", parentId: null, folderId: folder.id });
  db.saveContent(page.id, "Gedanke", 1);
  const child = db.create({ title: "Unterseite", parentId: page.id });
  db.folders.update(folder.id, { name: "Ideen", sortOrder: -1 });
  expect(db.folders.list()[0]?.name).toBe("Ideen");
  db.folders.remove(folder.id);
  expect(db.get(page.id)).toMatchObject({ folderId: null, content: "Gedanke", archived: false });
  expect(db.get(child.id)?.parentId).toBe(page.id);
});

it("weist unbekannte Ordner ab und lässt Metadaten dabei unverändert", () => {
  const { db } = fixture();
  const page = db.create({ title: "Original", parentId: null });
  const missing = "00000000-0000-4000-8000-000000000001";
  expect(() => db.create({ title: "Falsch", parentId: null, folderId: missing })).toThrow(/Ordner existiert nicht/);
  expect(() => db.update(page.id, { title: "Falsch", folderId: missing })).toThrow(/Ordner existiert nicht/);
  expect(db.get(page.id)?.title).toBe("Original");
  const parent = db.create({ title: "Eltern", parentId: null });
  db.update(page.id, { parentId: parent.id });
  expect(db.get(page.id)?.folderId).toBeNull();
});
