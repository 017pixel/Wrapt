import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  noteSchema,
  type CreateNoteRequest,
  type Note,
  type NoteSearchQuery,
  type NoteSummary,
  type UpdateNoteRequest,
  type MoveNoteRequest,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { normalizeLegacyMediaLinks } from "./legacyMediaLinks.js";
import { noteSearchRangeStart } from "./searchRange.js";
import { NoteFoldersDatabase } from "./folders.js";
import { createNoteExcerpt, escapeLikePattern } from "./excerpt.js";
import { migrateNoteExcerpts, rebuildNoteExcerpts } from "./excerptMigration.js";
export { createNoteExcerpt, escapeLikePattern } from "./excerpt.js";
import { moveNoteInOrder } from "./ordering.js";

/**
 * Eigene Tabelle für das Notizen-Feature in der gemeinsamen SQLite-Datei.
 * Inhalt ist Markdown; die Revision schützt vor stillen Überschreibungen.
 */

interface NoteRow {
  id: string;
  title: string;
  content: string;
  icon: string | null;
  cover_asset_id: string | null;
  parent_id: string | null;
  folder_id: string | null;
  sort_order: number;
  favorite: number;
  archived: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

type SummaryRow = Omit<NoteRow, "revision" | "content"> & { content?: string; excerpt?: string };

function toNote(row: NoteRow): Note {
  return noteSchema.parse({
    id: row.id,
    title: row.title,
    content: normalizeLegacyMediaLinks(row.content),
    icon: row.icon,
    coverAssetId: row.cover_asset_id,
    parentId: row.parent_id,
    folderId: row.folder_id,
    sortOrder: row.sort_order,
    favorite: row.favorite === 1,
    archived: row.archived === 1,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toSummary(row: SummaryRow, match?: string): NoteSummary {
  return {
    id: row.id,
    title: row.title,
    icon: row.icon,
    parentId: row.parent_id,
    folderId: row.folder_id,
    sortOrder: row.sort_order,
    favorite: row.favorite === 1,
    archived: row.archived === 1,
    excerpt: match === undefined && row.excerpt !== undefined ? row.excerpt : createNoteExcerpt(row.content ?? "", match),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class NotesDatabase {
  private readonly db: DatabaseSync;
  readonly folders: NoteFoldersDatabase;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    // P-010: NORMAL statt FULL (WAL bleibt haltbar); busy_timeout für Schreib-Tx belassen.
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '',
        icon TEXT,
        cover_asset_id TEXT,
        parent_id TEXT REFERENCES notes(id),
        sort_order REAL NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS notes_parent ON notes(parent_id);
      CREATE INDEX IF NOT EXISTS notes_order ON notes(archived, favorite, updated_at DESC);
      CREATE TABLE IF NOT EXISTS notes_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT OR IGNORE INTO notes_schema_migrations(version, applied_at) VALUES (1, datetime('now'));
      CREATE TABLE IF NOT EXISTS note_conflict_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note_id TEXT NOT NULL,
        content TEXT NOT NULL,
        expected_revision INTEGER NOT NULL,
        current_revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    this.folders = new NoteFoldersDatabase(this.db);
    migrateNoteExcerpts(this.db);
  }

  close(): void {
    this.db.close();
  }

  rebuildExcerpts(): void { rebuildNoteExcerpts(this.db); }

  list(): NoteSummary[] {
    const rows = this.db
      .prepare(`SELECT id, title, excerpt, icon, cover_asset_id, parent_id, folder_id, sort_order, favorite, archived, created_at, updated_at
        FROM notes ORDER BY sort_order ASC, updated_at DESC`)
      .all() as unknown as SummaryRow[];
    return rows.map((row) => toSummary(row));
  }

  search(input: NoteSearchQuery): NoteSummary[] {
    const pattern = escapeLikePattern(input.q);
    const conditions = ["archived = 0"];
    const params: Array<string> = [];
    if (input.titleOnly) {
      conditions.push("title LIKE ? ESCAPE '\\'");
      params.push(pattern);
    } else {
      conditions.push("(title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\')");
      params.push(pattern, pattern);
    }
    if (input.scopeId !== undefined) {
      conditions.push(`id IN (
        WITH RECURSIVE subtree(id) AS (
          SELECT id FROM notes WHERE id = ?
          UNION ALL
          SELECT child.id FROM notes child JOIN subtree parent ON child.parent_id = parent.id
        )
        SELECT id FROM subtree
      )`);
      params.push(input.scopeId);
    }
    const createdAfter = noteSearchRangeStart(input.createdWithin);
    if (createdAfter !== null) {
      conditions.push("created_at >= ?");
      params.push(createdAfter);
    }
    const updatedAfter = noteSearchRangeStart(input.updatedWithin);
    if (updatedAfter !== null) {
      conditions.push("updated_at >= ?");
      params.push(updatedAfter);
    }
    const rows = this.db
      .prepare(`SELECT id, title, content, icon, cover_asset_id, parent_id, folder_id, sort_order, favorite, archived, created_at, updated_at
        FROM notes
        WHERE ${conditions.join(" AND ")}
        ORDER BY updated_at DESC`)
      .all(...params) as unknown as SummaryRow[];
    return rows.map((row) => toSummary(row, input.q));
  }

  get(noteId: string): Note | null {
    const row = this.db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId) as unknown as NoteRow | undefined;
    return row ? toNote(row) : null;
  }

  create(input: CreateNoteRequest): Note {
    this.assertParent(null, input.parentId);
    this.folders.assertExists(input.folderId);
    const now = new Date().toISOString();
    const id = randomUUID();
    const sortOrder = this.nextSortOrder(input.parentId);
    this.db
      .prepare(`INSERT INTO notes (id, title, content, icon, cover_asset_id, parent_id, folder_id, sort_order, favorite, archived, revision, created_at, updated_at)
        VALUES (?, ?, '', NULL, NULL, ?, ?, ?, ?, 0, 1, ?, ?)`)
      .run(id, input.title, input.parentId, input.parentId === null ? input.folderId ?? null : null, sortOrder, input.favorite ? 1 : 0, now, now);
    return this.get(id)!;
  }

  update(noteId: string, input: UpdateNoteRequest): Note {
    const current = this.requireNote(noteId);
    if (input.parentId !== undefined) this.assertParent(noteId, input.parentId);
    this.folders.assertExists(input.folderId);
    const next = {
      title: input.title ?? current.title,
      icon: input.icon === undefined ? current.icon : input.icon,
      coverAssetId: input.coverAssetId === undefined ? current.coverAssetId : input.coverAssetId,
      parentId: input.parentId === undefined ? current.parentId : input.parentId,
      folderId: input.folderId === undefined ? current.folderId ?? null : input.folderId,
      sortOrder: input.sortOrder ?? current.sortOrder,
      favorite: input.favorite ?? current.favorite,
      archived: input.archived ?? current.archived,
    };
    // Mit gesetzter Revision gilt optimistisches Sperren wie bei saveContent:
    // atomares UPDATE mit Revisionsbedingung, danach revision+1. Ohne Wert
    // (Altdaten) bleibt das Schreiben blind und die Revision unverändert.
    if (input.expectedRevision === undefined || input.expectedRevision === null) {
      this.db
        .prepare(`UPDATE notes SET title=?, icon=?, cover_asset_id=?, parent_id=?, folder_id=?, sort_order=?, favorite=?, archived=?, updated_at=?
        WHERE id=?`)
        .run(
          next.title,
          next.icon,
          next.coverAssetId,
          next.parentId,
          next.parentId === null ? next.folderId : null,
          next.sortOrder,
          next.favorite ? 1 : 0,
          next.archived ? 1 : 0,
          new Date().toISOString(),
          noteId,
        );
      return this.get(noteId)!;
    }
    const changed = this.db
      .prepare(`UPDATE notes SET title=?, icon=?, cover_asset_id=?, parent_id=?, folder_id=?, sort_order=?, favorite=?, archived=?, revision=revision+1, updated_at=?
        WHERE id=? AND revision=?`)
      .run(
        next.title,
        next.icon,
        next.coverAssetId,
        next.parentId,
        next.parentId === null ? next.folderId : null,
        next.sortOrder,
        next.favorite ? 1 : 0,
        next.archived ? 1 : 0,
        new Date().toISOString(),
        noteId,
        input.expectedRevision,
      );
    if (changed.changes === 0) {
      this.writeMetadataConflictBackup(noteId, input, input.expectedRevision, current.revision);
      throw new AppError(409, "NOTE_REVISION_CONFLICT", "Diese Notiz wurde anderweitig geändert. Bitte aktualisiere die Ansicht und versuche es erneut.");
    }
    return this.get(noteId)!;
  }

  move(noteId: string, input: MoveNoteRequest): Note {
    const expectedRevision = input.expectedRevision ?? undefined;
    return moveNoteInOrder(this.db, noteId, input, () => this.update(noteId, {
      parentId: input.parentId,
      ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
      ...(expectedRevision === undefined ? {} : { expectedRevision }),
    }));
  }

  /**
   * Speichert den Inhalt nur, wenn die erwartete Revision noch aktuell ist.
   * Bei einem Konflikt geht die übergebene Fassung nicht verloren: Sie landet
   * in `note_conflict_backups` und die aktuelle Notiz wird zurückgegeben.
   */
  saveContent(
    noteId: string,
    content: string,
    expectedRevision: number,
  ): { status: "saved" | "conflict"; note: Note } {
    const current = this.requireNote(noteId);
    if (current.revision !== expectedRevision) {
      this.db
        .prepare(`INSERT INTO note_conflict_backups(note_id, content, expected_revision, current_revision, created_at)
          VALUES (?, ?, ?, ?, ?)`)
        .run(noteId, content, expectedRevision, current.revision, new Date().toISOString());
      this.pruneConflictBackups();
      return { status: "conflict", note: current };
    }
    this.db
      .prepare("UPDATE notes SET content=?, excerpt=?, revision=revision+1, updated_at=? WHERE id=?")
      .run(content, createNoteExcerpt(content), new Date().toISOString(), noteId);
    return { status: "saved", note: this.get(noteId)! };
  }

  /** Legt eine Notiz in den Papierkorb; Untergeordnete bleiben verknüpft. */
  archive(noteId: string): Note {
    return this.update(noteId, { archived: true });
  }

  restore(noteId: string): Note {
    return this.update(noteId, { archived: false });
  }

  private requireNote(noteId: string): Note {
    const note = this.get(noteId);
    if (!note) throw new AppError(404, "NOTE_NOT_FOUND", "Diese Notiz wurde nicht gefunden.");
    return note;
  }

  private nextSortOrder(parentId: string | null): number {
    const row = this.db
      .prepare("SELECT MAX(sort_order) AS maxOrder FROM notes WHERE parent_id IS ?")
      .get(parentId) as unknown as { maxOrder: number | null };
    return (row.maxOrder ?? 0) + 1;
  }

  /** Verhindert fehlende Eltern und Zyklen (eine Notiz kann nicht ihr eigener Vorfahre sein). */
  private assertParent(noteId: string | null, parentId: string | null): void {
    if (parentId === null) return;
    if (noteId !== null && parentId === noteId) {
      throw new AppError(400, "NOTE_PARENT_INVALID", "Eine Notiz kann nicht ihre eigene Unterseite sein.");
    }
    const parent = this.get(parentId);
    if (!parent) throw new AppError(400, "NOTE_PARENT_INVALID", "Die gewählte übergeordnete Notiz existiert nicht.");
    const seen = new Set<string>([parentId]);
    let cursor = parent.parentId;
    while (cursor !== null) {
      if (noteId !== null && cursor === noteId) {
        throw new AppError(400, "NOTE_PARENT_INVALID", "Unterseiten dürfen keinen Kreis bilden.");
      }
      if (seen.has(cursor)) break;
      seen.add(cursor);
      cursor = this.get(cursor)?.parentId ?? null;
    }
  }

  private pruneConflictBackups(): void {
    this.db.prepare(`DELETE FROM note_conflict_backups WHERE id NOT IN (
      SELECT id FROM note_conflict_backups ORDER BY id DESC LIMIT 100
    )`).run();
  }

  /**
   * Sichert einen verworfenen Metadaten-Versuch wie saveContent: Der Versuch
   * geht nicht verloren, sondern landet als JSON in `note_conflict_backups`.
   */
  private writeMetadataConflictBackup(noteId: string, input: UpdateNoteRequest, expectedRevision: number, currentRevision: number): void {
    this.db
      .prepare(`INSERT INTO note_conflict_backups(note_id, content, expected_revision, current_revision, created_at)
        VALUES (?, ?, ?, ?, ?)`)
      .run(noteId, JSON.stringify({ kind: "metadata", attempted: input }), expectedRevision, currentRevision, new Date().toISOString());
    this.pruneConflictBackups();
  }
}
