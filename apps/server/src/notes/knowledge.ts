import type { DatabaseSync } from "node:sqlite";
import type { Note, NoteKnowledge } from "@wrapt/contracts";
import { NOTE_HISTORY_BUDGET_BYTES, NOTE_HISTORY_MAX_VERSIONS } from "@wrapt/contracts";

interface HistoryRow {
  id: number;
  title: string;
  revision: number;
  created_at: string;
  size_bytes: number;
}

const BYTES_EXPRESSION = "length(CAST(content AS BLOB))";

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
        DELETE FROM note_history WHERE note_id = OLD.id AND id NOT IN (SELECT id FROM note_history WHERE note_id = OLD.id ORDER BY id DESC LIMIT ${NOTE_HISTORY_MAX_VERSIONS});
      END;
    `);
  }

  metadata(noteId: string): NoteKnowledge {
    const row = this.db.prepare("SELECT project_id, tags FROM note_knowledge WHERE note_id = ?").get(noteId) as { project_id: string | null; tags: string } | undefined;
    return { projectId: row?.project_id ?? null, tags: row ? parseTags(row.tags) : [] };
  }

  setMetadata(noteId: string, value: NoteKnowledge) {
    this.db.prepare("INSERT INTO note_knowledge(note_id, project_id, tags) VALUES (?, ?, ?) ON CONFLICT(note_id) DO UPDATE SET project_id=excluded.project_id, tags=excluded.tags")
      .run(noteId, value.projectId, JSON.stringify([...new Set(value.tags)]));
    return this.metadata(noteId);
  }

  /** Verlaufsliste ohne Volltexte; der Inhalt wird über `historyEntry` geladen. */
  history(noteId: string): Array<{ id: number; title: string; revision: number; sizeBytes: number; createdAt: string }> {
    const rows = this.db
      .prepare(`SELECT id, title, revision, created_at, ${BYTES_EXPRESSION} AS size_bytes FROM note_history WHERE note_id = ? ORDER BY id DESC`)
      .all(noteId) as unknown as HistoryRow[];
    return rows.map((row) => ({ id: row.id, title: row.title, revision: row.revision, sizeBytes: row.size_bytes, createdAt: row.created_at }));
  }

  historyEntry(noteId: string, entryId: number) {
    const row = this.db
      .prepare(`SELECT content, title, revision, created_at FROM note_history WHERE id = ? AND note_id = ?`)
      .get(entryId, noteId) as { content: string; title: string; revision: number; created_at: string } | undefined;
    return row ? { content: row.content, title: row.title, revision: row.revision, createdAt: row.created_at } : null;
  }

  /** Entfernt älteste Fassungen, bis die Notiz ihr Byte-Budget einhält. */
  pruneHistory(noteId: string): void {
    const rows = this.db
      .prepare(`SELECT id, ${BYTES_EXPRESSION} AS size_bytes FROM note_history WHERE note_id = ? ORDER BY id ASC`)
      .all(noteId) as unknown as Array<{ id: number; size_bytes: number }>;
    let total = rows.reduce((sum, row) => sum + row.size_bytes, 0);
    const remove = this.db.prepare("DELETE FROM note_history WHERE id = ?");
    for (const row of rows) {
      if (total <= NOTE_HISTORY_BUDGET_BYTES) break;
      remove.run(row.id);
      total -= row.size_bytes;
    }
  }

  historyBytes(noteId?: string): number {
    const row = (noteId === undefined
      ? this.db.prepare(`SELECT COALESCE(SUM(${BYTES_EXPRESSION}), 0) AS bytes FROM note_history`).get()
      : this.db.prepare(`SELECT COALESCE(SUM(${BYTES_EXPRESSION}), 0) AS bytes FROM note_history WHERE note_id = ?`).get(noteId)) as { bytes: number };
    return row.bytes;
  }

  pruneAll(): void {
    const rows = this.db.prepare("SELECT DISTINCT note_id FROM note_history").all() as unknown as Array<{ note_id: string }>;
    for (const row of rows) this.pruneHistory(row.note_id);
  }

  backlinks(noteId: string, notes: Note[]) {
    // Stabile IDs halten Verweise auch bei Umbenennungen gültig.
    const reference = new RegExp('\\[noteMention\\s+[^\\]]*noteId="' + noteId + '"');
    return notes.filter((note) => note.id !== noteId && !note.archived && reference.test(note.content))
      .map((note) => ({ id: note.id, title: note.title, excerpt: note.content.slice(0, 200) }));
  }
}

/** Beschädigte Tag-Dokumente dürfen die Notizliste nicht dauerhaft blockieren. */
function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}
