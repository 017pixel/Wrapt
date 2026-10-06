import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { NotesDatabase } from "./database.js";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
function database() {
  const root = mkdtempSync(join(tmpdir(), "wrapt-note-order-"));
  cleanup.push(() => rmSync(root, { recursive: true, force: true }));
  const db = new NotesDatabase(join(root, "notes.sqlite"));
  cleanup.push(() => db.close());
  return db;
}
it("ordnet gleiche und extreme Sortierwerte ohne Positionsverlust neu", () => {
  const db = database();
  const pages = ["A", "B", "C"].map((title) => db.create({ title, parentId: null }));
  for (const page of pages) db.update(page.id, { sortOrder: 1_000_000 });
  db.move(pages[2]!.id, { parentId: null, beforeId: pages[1]!.id });
  const list = db.list();
  expect(list.findIndex((page) => page.id === pages[2]!.id) + 1).toBe(list.findIndex((page) => page.id === pages[1]!.id));
  expect(list.map((page) => page.sortOrder)).toEqual([1, 2, 3]);
});
it("rollt eine ungültige Reihenfolge samt Ordnerwechsel vollständig zurück", () => {
  const db = database();
  const folder = db.folders.create("Ordner");
  const page = db.create({ title: "Original", parentId: null, folderId: folder.id });
  const parent = db.create({ title: "Eltern", parentId: null });
  const child = db.create({ title: "Kind", parentId: parent.id });
  expect(() => db.move(page.id, { parentId: null, folderId: null, beforeId: child.id })).toThrow(/Ebene/);
  expect(db.get(page.id)).toMatchObject({ folderId: folder.id, parentId: null, sortOrder: page.sortOrder });
  expect(() => db.move(parent.id, { parentId: child.id, beforeId: null })).toThrow(/Kreis/);
  expect(db.get(parent.id)?.parentId).toBeNull();
});
