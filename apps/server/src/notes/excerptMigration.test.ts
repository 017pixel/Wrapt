import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { NotesDatabase, createNoteExcerpt } from "./database.js";

it("backfillt Altbestand atomar, erhält Details und baut beschädigte Ableitungen neu", () => {
  const root = mkdtempSync(join(tmpdir(), "notes-excerpts-"));
  const path = join(root, "fixture.sqlite");
  let notes = new NotesDatabase(path);
  const created = notes.create({ title: "Altbestand", parentId: null });
  const content = "# Titel\n\n[Hallo](https://example.invalid) Grüße aus 東京\n\n```ts\nconst geheim = 42;\n```\n\n- Ende";
  notes.saveContent(created.id, content, 1);
  const oldDetail = notes.get(created.id);
  notes.close();
  const db = new DatabaseSync(path);
  try {
    db.exec("ALTER TABLE notes DROP COLUMN excerpt; DELETE FROM notes_schema_migrations WHERE version=4");
    notes = new NotesDatabase(path);
    expect(notes.get(created.id)).toEqual(oldDetail);
    expect(notes.list()[0]?.excerpt).toBe("Titel Hallo Grüße aus 東京 Ende");
    expect(db.prepare("SELECT excerpt FROM notes WHERE id=?").get(created.id)?.excerpt).toBe(createNoteExcerpt(content));
    const saved = notes.saveContent(created.id, "**Neue Fassung**", 2);
    expect(saved.status).toBe("saved");
    expect(notes.list()[0]?.excerpt).toBe("Neue Fassung");
    notes.saveContent(created.id, "Stale Fassung", 1);
    expect(notes.list()[0]?.excerpt).toBe("Neue Fassung");
    db.prepare("UPDATE notes SET excerpt='falsche Ableitung' WHERE id=?").run(created.id);
    notes.rebuildExcerpts();
    expect(notes.list()[0]?.excerpt).toBe("Neue Fassung");
    expect(JSON.stringify(db.prepare("EXPLAIN QUERY PLAN SELECT id, excerpt FROM notes ORDER BY sort_order, updated_at DESC").all()))
      .toContain("notes_summary_order");
  } finally {
    db.close();
    notes.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it.each(["Ünicode 東京", "# Titel\n\n[Link](https://example.invalid)", "```ts\nconst x = 1;\n```\n**Danach**", "- [x] Erledigt\n> Zitat", "a".repeat(20_000)].map((content, index) => ({ content, index })))(
  "liefert bytegleiche Vorschauen nach Save und erneutem Öffnen: $index", ({ content }) => {
    const root = mkdtempSync(join(tmpdir(), "notes-excerpts-roundtrip-"));
    const path = join(root, "fixture.sqlite");
    let notes = new NotesDatabase(path);
    try {
      const note = notes.create({ title: "Notiz", parentId: null });
      notes.saveContent(note.id, content, 1);
      expect(notes.list()[0]?.excerpt).toBe(createNoteExcerpt(content));
      notes.close();
      notes = new NotesDatabase(path);
      expect(notes.list()[0]?.excerpt).toBe(createNoteExcerpt(content));
      expect(notes.get(note.id)?.content).toBe(content);
    } finally {
      notes.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
);
