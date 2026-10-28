import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { NotesDatabase } from "./database.js";
import Fastify from "fastify";
import { registerNoteTransferRoutes } from "./transferRoutes.js";
const roots: string[] = [];
const databases: NotesDatabase[] = [];
afterEach(() => { databases.splice(0).forEach((db) => db.close()); roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "notes-transfer-")); roots.push(root);
  const db = new NotesDatabase(join(root, "notes.sqlite")); databases.push(db);
  const app = Fastify(); registerNoteTransferRoutes(app, db);
  return { db, app };
}
it("exportiert die Ablage in einer Anfrage und importiert mit neuen IDs", async () => {
  const { db, app } = setup();
  const folder = db.folders.create("Projekte");
  const parent = db.create({ title: "Projekt", parentId: null, folderId: folder.id });
  const child = db.create({ title: "Idee", parentId: parent.id });
  db.saveContent(parent.id, `[noteMention noteId="${child.id}" label="Idee"]`, 1);
  db.knowledge.setMetadata(parent.id, { projectId: "wrapt", tags: ["Wissen"] });
  const archive = (await app.inject("/notes/export")).json();
  const result = await app.inject({ method: "POST", url: "/notes/import", payload: archive });
  expect(result.statusCode).toBe(200);
  expect(result.json()).toEqual({ created: 2 });
  const importedParent = db.list().find((note) => note.title === parent.title && note.id !== parent.id)!;
  const importedChild = db.list().find((note) => note.title === child.title && note.id !== child.id)!;
  expect(importedChild.parentId).toBe(importedParent.id);
  expect(db.get(importedParent.id)?.content).toContain(importedChild.id);
  expect(db.knowledge.metadata(importedParent.id)).toEqual({ projectId: "wrapt", tags: ["Wissen"] });
  expect(db.get(parent.id)?.content).toContain(child.id);
  await app.close();
});
it("rollt einen fehlerhaften Seitenbaum vollständig zurück", async () => {
  const { db, app } = setup();
  const first = db.create({ title: "Bestehend", parentId: null });
  const second = db.create({ title: "Andere", parentId: null });
  const archive = (await app.inject("/notes/export")).json();
  archive.notes[0].parentId = second.id;
  archive.notes[1].parentId = first.id;
  const response = await app.inject({ method: "POST", url: "/notes/import", payload: archive });
  expect(response.statusCode).toBeGreaterThanOrEqual(400);
  expect(db.list().map((note) => note.id).sort()).toEqual([first.id, second.id].sort());
  await app.close();
});
it("weist unvollständige Hierarchien ab, statt sie still in den Eingang zu verschieben", async () => {
  const { db, app } = setup();
  const note = db.create({ title: "Bestehend", parentId: null });
  const archive = (await app.inject("/notes/export")).json();
  archive.notes[0].parentId = "00000000-0000-4000-8000-000000000001";
  const response = await app.inject({ method: "POST", url: "/notes/import", payload: archive });
  expect(response.statusCode).toBeGreaterThanOrEqual(400);
  expect(db.list()).toHaveLength(1);
  expect(db.get(note.id)?.parentId).toBeNull();
  await app.close();
});
