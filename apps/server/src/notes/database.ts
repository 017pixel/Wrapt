import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  noteSchema,
  NOTE_EXCERPT_MAX_LENGTH,
  type CreateNoteRequest,
  type Note,
  type NoteSearchQuery,
  type NoteSummary,
  type UpdateNoteRequest,
  type MoveNoteRequest,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { migrateOrbitSources, type OrbitNotesMigrationResult } from "./orbitSourceMigration.js";
import { noteSearchRangeStart } from "./searchRange.js";
import { NoteFoldersDatabase } from "./folders.js";
import { moveNoteInOrder } from "./ordering.js";

/**
 * Eigene Tabelle für das Notizen-Feature in derselben SQLite-Datei wie Orbit.
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

type SummaryRow = Omit<NoteRow, "revision">;

function toNote(row: NoteRow): Note {
  return noteSchema.parse({
    id: row.id,
    title: row.title,
    content: row.content,
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
    excerpt: createNoteExcerpt(row.content, match),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Reiner Text einer Notiz: Markdown-Zeichen fallen weg, Code zählt nicht. */
function notePlainText(content: string): string {
  return content
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*\[[ xX]\]\s*/gm, "")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kurze, gut lesbare Vorschau. Mit `match` liegt das Fenster um den ersten
 * Treffer, damit Suchergebnisse den Fundort zeigen.
 */
export function createNoteExcerpt(content: string, match?: string): string {
  const plain = notePlainText(content);
  const needle = match?.trim().toLowerCase() ?? "";
  if (needle === "") return plain.slice(0, NOTE_EXCERPT_MAX_LENGTH);
  const index = plain.toLowerCase().indexOf(needle);
  if (index === -1) return plain.slice(0, NOTE_EXCERPT_MAX_LENGTH);
  const start = Math.max(0, index - 60);
  const end = Math.min(plain.length, index + needle.length + 100);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < plain.length ? "…" : "";
  return `${prefix}${plain.slice(start, end).trim()}${suffix}`.slice(0, NOTE_EXCERPT_MAX_LENGTH);
}

/** LIKE-Suchmuster: Prozent- und Unterstrichzeichen der Eingabe bleiben Text. */
export function escapeLikePattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (match) => `\\${match}`)}%`;
}

export class NotesDatabase {
  private readonly db: DatabaseSync;
  readonly folders: NoteFoldersDatabase;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON");
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
      CREATE TABLE IF NOT EXISTS note_source_migrations (
        source_id TEXT PRIMARY KEY,
        target_note_id TEXT NOT NULL REFERENCES notes(id),
        source_hash TEXT NOT NULL,
        source_type TEXT NOT NULL CHECK(source_type IN ('note', 'todo')),
        source_title TEXT NOT NULL,
        source_content TEXT NOT NULL,
        imported_title TEXT NOT NULL,
        imported_content TEXT NOT NULL,
        migrated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO notes_schema_migrations(version, applied_at) VALUES (2, datetime('now'));
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
  }

  close(): void {
    this.db.close();
  }

  migrateOrbitSources(): OrbitNotesMigrationResult {
    return migrateOrbitSources(this.db);
  }

  list(): NoteSummary[] {
    const rows = this.db
      .prepare(`SELECT id, title, content, icon, cover_asset_id, parent_id, folder_id, sort_order, favorite, archived, created_at, updated_at
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

  move(noteId: string, input: MoveNoteRequest): Note {
    return moveNoteInOrder(this.db, noteId, input, () => this.update(noteId, {
      parentId: input.parentId,
      ...(input.folderId === undefined ? {} : { folderId: input.folderId }),
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
      .prepare("UPDATE notes SET content=?, revision=revision+1, updated_at=? WHERE id=?")
      .run(content, new Date().toISOString(), noteId);
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
}
