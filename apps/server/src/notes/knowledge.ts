import type { DatabaseSync } from "node:sqlite";
import type { Note, NoteKnowledge } from "@wrapt/contracts";

/** Ergänzende Daten und Verlauf, ohne das bestehende Markdown-Schema zu verändern. */
export class NoteKnowledgeDatabase {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS note_knowledge (note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE, project_id TEXT, tags TEXT NOT NULL DEFAULT '[]');
      CREATE TABLE IF NOT EXISTS note_history (id INTEGER PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, title TEXT NOT NULL, content TEXT NOT NULL, revision INTEGER NOT NULL, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS note_history_note ON note_history(note_id, id DESC);
      CREATE TRIGGER IF NOT EXISTS notes_history_update BEFORE UPDATE ON notes
      WHEN OLD.content != NEW.content OR OLD.title != NEW.title BEGIN
        INSERT INTO note_history(note_id, title, content, revision, created_at) VALUES (OLD.id, OLD.title, OLD.content, OLD.revision, OLD.updated_at);
        DELETE FROM note_history WHERE note_id = OLD.id AND id NOT IN (SELECT id FROM note_history WHERE note_id = OLD.id ORDER BY id DESC LIMIT 100);
      END;
    `);
  }
  metadata(noteId: string): NoteKnowledge {
    const row = this.db.prepare("SELECT project_id, tags FROM note_knowledge WHERE note_id = ?").get(noteId) as { project_id: string | null; tags: string } | undefined;
    return { projectId: row?.project_id ?? null, tags: row ? JSON.parse(row.tags) as string[] : [] };
  }
  setMetadata(noteId: string, value: NoteKnowledge) {
    this.db.prepare("INSERT INTO note_knowledge(note_id, project_id, tags) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET project_id=excluded.project_id, tags=excluded.tags")
      .run(noteId, value.projectId, JSON.stringify([...new Set(value.tags)]));
    return this.metadata(noteId);
  }
  history(noteId: string) {
    return this.db.prepare("SELECT id, title, content, revision, created_at AS createdAt FROM note_history WHERE note_id = ? ORDER BY id DESC").all(noteId);
  }
  backlinks(noteId: string, notes: Note[]) {
    // Stabile IDs halten Verweise auch bei Umbenennungen gültig.
    const reference = new RegExp('\\[noteMention\\s+[^\\]]*noteId="' + noteId + '"');
    return notes.filter((note) => note.id !== noteId && !note.archived && reference.test(note.content))
      .map((note) => ({ id: note.id, title: note.title, excerpt: note.content.slice(0, 200) }));
  }
}
