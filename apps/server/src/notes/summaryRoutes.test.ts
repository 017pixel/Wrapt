import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import Fastify from "fastify";
import { NotesDatabase } from "./database.js";
import { registerNotesRoutes } from "./routes.js";

const roots: string[] = [];
const databases: NotesDatabase[] = [];
afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "notes-summary-"));
  roots.push(root);
  const notes = new NotesDatabase(join(root, "notes.sqlite"));
  databases.push(notes);
  const app = Fastify();
  await registerNotesRoutes(app, { notes });
  return { app, notes };
}

it("liefert bei unveränderter Revision nur ein Unchanged-Signal", async () => {
  const { app, notes } = await setup();
  const note = notes.create({ title: "Detail", parentId: null });
  const saved = notes.saveContent(note.id, "Inhalt", 1).note;
  const unchanged = await app.inject(`/notes/${note.id}?sinceRevision=${saved.revision}`);
  expect(unchanged.statusCode).toBe(200);
  expect(unchanged.json()).toEqual({ unchanged: true, revision: saved.revision });
  const full = await app.inject(`/notes/${note.id}?sinceRevision=1`);
  expect(full.json()).toMatchObject({ note: { content: "Inhalt", revision: saved.revision } });
  await app.close();
});

it("speichert mit response=summary ohne Volltext in der Antwort", async () => {
  const { app, notes } = await setup();
  const note = notes.create({ title: "Detail", parentId: null });
  const saved = notes.saveContent(note.id, "Erster", 1).note;
  const response = await app.inject({ method: "PUT", url: `/notes/${note.id}/content?response=summary`, payload: { content: "Zweiter", expectedRevision: saved.revision } });
  expect(response.json()).toEqual({ status: "saved", summary: { id: note.id, revision: saved.revision + 1, updatedAt: expect.any(String) } });
  const conflict = await app.inject({ method: "PUT", url: `/notes/${note.id}/content?response=summary`, payload: { content: "Dritter", expectedRevision: saved.revision } });
  expect(conflict.json()).toMatchObject({ status: "conflict", note: { content: "Zweiter" } });
  await app.close();
});
