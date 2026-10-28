import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import { NotesDatabase } from "./database.js";
import { registerNoteKnowledgeRoutes } from "./knowledgeRoutes.js";
import { noteTasks } from "./tasks.js";
const roots: string[] = [];
const databases: NotesDatabase[] = [];
afterEach(() => { databases.splice(0).forEach((db) => db.close()); roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })); });
function setup() {
  const root = mkdtempSync(join(tmpdir(), "notes-knowledge-")); roots.push(root);
  const db = new NotesDatabase(join(root, "notes.sqlite")); databases.push(db);
  const app = Fastify(); registerNoteKnowledgeRoutes(app, db);
  return { db, app };
}
it("erhält frühere Inhalte beim Speichern, Umbenennen und Wiederherstellen", async () => {
  const { db, app } = setup();
  const note = db.create({ title: "Idee", parentId: null });
  db.saveContent(note.id, "Erste Idee", 1);
  db.saveContent(note.id, "Zweite Idee", 2);
  const entries = (await app.inject(`/notes/${note.id}/history`)).json().entries;
  expect(entries[0]).toMatchObject({ content: "Erste Idee", revision: 2 });
  const response = await app.inject({ method: "POST", url: `/notes/${note.id}/history/restore`, payload: { entryId: entries[0].id, expectedRevision: 3 } });
  expect(response.json()).toMatchObject({ status: "saved", note: { content: "Erste Idee" } });
  const conflict = await app.inject({ method: "POST", url: `/notes/${note.id}/history/restore`, payload: { entryId: entries[0].id, expectedRevision: 3 } });
  expect(conflict.json().status).toBe("conflict");
  expect(db.get(note.id)?.content).toBe("Erste Idee");
  await app.close();
});
it("aktualisiert die Originalaufgabe und schützt fremde Revisionen", async () => {
  const { db, app } = setup();
  const note = db.create({ title: "Arbeit", parentId: null });
  const content = "- [ ] Prüfen\n```md\n- [ ] Nur ein Beispiel\n```\n- [x] Erledigt";
  const saved = db.saveContent(note.id, content, 1).note;
  expect(noteTasks(saved, null)).toHaveLength(2);
  const updated = await app.inject({ method: "PATCH", url: `/notes/${note.id}/tasks/0`, payload: { expectedRevision: saved.revision, checked: true, due: "2026-11-01" } });
  expect(updated.json()).toMatchObject({ status: "saved", note: { content: expect.stringContaining("- [x] Prüfen [due:: 2026-11-01]") } });
  const conflict = await app.inject({ method: "PATCH", url: `/notes/${note.id}/tasks/0`, payload: { expectedRevision: saved.revision, checked: false } });
  expect(conflict.json().status).toBe("conflict");
  expect(db.get(note.id)?.content).toContain("- [x] Prüfen");
  await app.close();
});
it("hält Rückverweise nach Umbenennen und Projektzuordnung getrennt vom Inhalt", async () => {
  const { db, app } = setup();
  const target = db.create({ title: "Ziel", parentId: null });
  const source = db.create({ title: "Quelle", parentId: null });
  db.saveContent(source.id, `[noteMention noteId="${target.id}" label="Ziel"]`, 1);
  db.update(target.id, { title: "Neues Ziel" });
  const backlinks = (await app.inject(`/notes/${target.id}/backlinks`)).json();
  expect(backlinks.notes).toMatchObject([{ id: source.id }]);
  const metadata = await app.inject({ method: "PUT", url: `/notes/${target.id}/metadata`, payload: { projectId: "wrapt", tags: ["Idee", "Idee"] } });
  expect(metadata.json().metadata).toEqual({ projectId: "wrapt", tags: ["Idee"] });
  expect(db.get(target.id)?.content).toBe("");
  await app.close();
});
