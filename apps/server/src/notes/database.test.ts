import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { NoteSearchQuery } from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { NotesDatabase, createNoteExcerpt, escapeLikePattern } from "./database.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function database() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-notes-"));
  directories.push(directory);
  const path = join(directory, "wrapt.sqlite");
  return { path, db: new NotesDatabase(path) };
}

function searchQuery(q: string, overrides: Partial<NoteSearchQuery> = {}): NoteSearchQuery {
  return { q, titleOnly: false, createdWithin: "any", updatedWithin: "any", ...overrides };
}

describe("NotesDatabase", () => {
  it("legt Notizen an, listet sie und liefert sie einzeln", async () => {
    const { db } = await database();
    const note = db.create({ title: "Einkaufsliste", parentId: null });
    expect(note.title).toBe("Einkaufsliste");
    expect(note.content).toBe("");
    expect(note.revision).toBe(1);
    expect(note.favorite).toBe(false);

    const list = db.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: note.id, title: "Einkaufsliste", excerpt: "" });

    expect(db.get(note.id)?.id).toBe(note.id);
    expect(db.get("00000000-0000-4000-8000-000000000000")).toBeNull();
    db.close();
  });

  it("erhöht die Revision nur bei passender erwarteter Revision", async () => {
    const { path, db } = await database();
    const note = db.create({ title: "Notiz", parentId: null });
    const saved = db.saveContent(note.id, "# Erste Fassung", 1);
    expect(saved.status).toBe("saved");
    expect(saved.note.revision).toBe(2);
    expect(saved.note.content).toBe("# Erste Fassung");

    const conflict = db.saveContent(note.id, "Veraltete Fassung", 1);
    expect(conflict.status).toBe("conflict");
    expect(conflict.note.revision).toBe(2);
    expect(conflict.note.content).toBe("# Erste Fassung");
    db.close();

    const raw = new DatabaseSync(path, { readOnly: true });
    const backup = raw.prepare("SELECT note_id, content, expected_revision, current_revision FROM note_conflict_backups").get() as {
      note_id: string;
      content: string;
      expected_revision: number;
      current_revision: number;
    };
    expect(backup).toEqual({ note_id: note.id, content: "Veraltete Fassung", expected_revision: 1, current_revision: 2 });
    raw.close();
  });

  it("aktualisiert Metadaten und sortiert Geschwister stabil", async () => {
    const { db } = await database();
    const first = db.create({ title: "Erste", parentId: null });
    const second = db.create({ title: "Zweite", parentId: null });
    expect(db.list().map((entry) => entry.title)).toEqual(["Erste", "Zweite"]);

    const updated = db.update(second.id, { favorite: true, icon: "Buch", title: "Zweite (wichtig)" });
    expect(updated.favorite).toBe(true);
    expect(updated.icon).toBe("Buch");
    expect(updated.revision).toBe(1);

    db.update(first.id, { sortOrder: 5 });
    expect(db.list().map((entry) => entry.title)).toEqual(["Zweite (wichtig)", "Erste"]);
    db.close();
  });

  it("archiviert in den Papierkorb und stellt wieder her", async () => {
    const { db } = await database();
    const note = db.create({ title: "Alt", parentId: null });
    const archived = db.archive(note.id);
    expect(archived.archived).toBe(true);
    expect(db.list()[0]?.archived).toBe(true);
    expect(db.restore(note.id).archived).toBe(false);
    db.close();
  });

  it("durchsucht Titel und Inhalt und maskiert LIKE-Zeichen", async () => {
    const { db } = await database();
    const recipe = db.create({ title: "Rezept", parentId: null });
    db.saveContent(recipe.id, "Zutaten: 50% Mehl und _Butter_", 1);
    db.create({ title: "Einkauf", parentId: null });

    expect(db.search(searchQuery("rezept")).map((entry) => entry.id)).toEqual([recipe.id]);
    expect(db.search(searchQuery("mehl")).map((entry) => entry.id)).toEqual([recipe.id]);
    expect(db.search(searchQuery("50%")).map((entry) => entry.id)).toEqual([recipe.id]);
    expect(db.search(searchQuery("_Butter_")).map((entry) => entry.id)).toEqual([recipe.id]);
    expect(db.search(searchQuery("fehlt"))).toEqual([]);
    db.close();
  });

  it("filtert Suche nach Titel, Bereich und Zeitraum und zeigt Treffer im Auszug", async () => {
    const { db } = await database();
    const parent = db.create({ title: "Projekt", parentId: null });
    const child = db.create({ title: "Notizen", parentId: parent.id });
    db.saveContent(child.id, `${"Vorlauf ".repeat(40)}Stichwort im Text`, 1);
    const other = db.create({ title: "Stichwort", parentId: null });

    expect(db.search(searchQuery("stichwort")).map((entry) => entry.id).sort()).toEqual(
      [child.id, other.id].sort(),
    );
    // Nur Titel: Der Fließtext zählt dann nicht.
    expect(db.search(searchQuery("stichwort", { titleOnly: true })).map((entry) => entry.id)).toEqual([
      other.id,
    ]);
    // Bereich: nur die Unterseiten von „Projekt“.
    expect(db.search(searchQuery("stichwort", { scopeId: parent.id })).map((entry) => entry.id)).toEqual([
      child.id,
    ]);
    // Zeitraum: „today“ und „month“ schließen frische Notizen nicht aus.
    expect(db.search(searchQuery("stichwort", { updatedWithin: "today" })).length).toBe(2);
    expect(db.search(searchQuery("stichwort", { createdWithin: "month" })).length).toBe(2);
    // Der Auszug zeigt den Fundort statt nur den Textanfang.
    expect(createNoteExcerpt("Vorlauf ".repeat(40) + "Stichwort im Text", "stichwort")).toContain(
      "Stichwort",
    );
    db.close();
  });

  it("verhindert fehlende Eltern, Selbstbezug und Kreise", async () => {
    const { db } = await database();
    const parent = db.create({ title: "Eltern", parentId: null });
    const child = db.create({ title: "Kind", parentId: parent.id });
    expect(child.parentId).toBe(parent.id);

    expect(() => db.update(parent.id, { parentId: parent.id })).toThrowError(AppError);
    expect(() => db.update(parent.id, { parentId: child.id })).toThrowError(AppError);
    expect(() =>
      db.create({ title: "Waise", parentId: "00000000-0000-4000-8000-000000000000" }),
    ).toThrowError(AppError);
    db.close();
  });

  it("bildet Vorschauen ohne Markdown- und Code-Rauschen", () => {
    expect(createNoteExcerpt("# Titel\n\nEin **fetter** Satz mit [Link](https://example.com).")).toBe(
      "Titel Ein fetter Satz mit Link.",
    );
    expect(createNoteExcerpt("```ts\nconst x = 1;\n```\nDanach")).toBe("Danach");
    expect(createNoteExcerpt("- [ ] Aufgabe eins\n- [x] Aufgabe zwei")).toBe("Aufgabe eins Aufgabe zwei");
    expect(createNoteExcerpt("x".repeat(400))).toHaveLength(200);
  });

  it("maskiert Suchmuster vollständig", () => {
    expect(escapeLikePattern("50%_x\\")).toBe("%50\\%\\_x\\\\%");
  });
});
