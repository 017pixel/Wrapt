import type { DatabaseSync } from "node:sqlite";
import type { NoteSearchQuery } from "@wrapt/contracts";
import { noteSearchRangeStart } from "./searchRange.js";

export interface NoteSearchRow {
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
  created_at: string;
  updated_at: string;
  excerpt?: string;
}

const FTS_SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
    title, content, content='notes', content_rowid='rowid',
    tokenize='unicode61 remove_diacritics 2'
  );
  CREATE TRIGGER IF NOT EXISTS notes_fts_insert AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_delete AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS notes_fts_update AFTER UPDATE OF title, content ON notes BEGIN
    INSERT INTO notes_fts(notes_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
    INSERT INTO notes_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
  END;
`;

/**
 * Legt den FTS5-Index an und gleicht ihn einmalig mit dem Bestand ab.
 * Fehlt FTS5 in der SQLite-Version, bleibt der Vollscan als Fallback.
 */
export function setupNoteSearch(db: DatabaseSync): boolean {
  try {
    db.exec(FTS_SCHEMA);
    const indexed = Number((db.prepare("SELECT COUNT(*) AS count FROM notes_fts").get() as { count: number }).count);
    const notes = Number((db.prepare("SELECT COUNT(*) AS count FROM notes").get() as { count: number }).count);
    if (indexed !== notes) db.exec("INSERT INTO notes_fts(notes_fts) VALUES('rebuild')");
    return true;
  } catch {
    return false;
  }
}

/** FTS5-Abfrage: Tokens als Präfix-Phrasen, Sonderzeichen bleiben Text. */
function ftsMatch(query: string, titleOnly: boolean): string {
  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 10)
    .map((token) => `"${token.replaceAll("\"", "\"\"")}"*`);
  return tokens.map((token) => titleOnly ? `title : ${token}` : token).join(" AND ");
}

function conditions(input: NoteSearchQuery): { sql: string[]; params: string[] } {
  const sql = ["archived = 0"];
  const params: string[] = [];
  if (input.scopeId !== undefined) {
    sql.push(`id IN (
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
  if (createdAfter !== null) { sql.push("created_at >= ?"); params.push(createdAfter); }
  const updatedAfter = noteSearchRangeStart(input.updatedWithin);
  if (updatedAfter !== null) { sql.push("updated_at >= ?"); params.push(updatedAfter); }
  return { sql, params };
}

/**
 * Sucht Notizen über den FTS5-Index. Nur Trefferkandidaten werden geladen;
 * Ranking und Excerpt bleiben beim Aufrufer. Bei fehlendem Index oder einem
 * FTS-Fehler fällt die Funktion auf den bisherigen Vollscan zurück.
 */
export function searchNoteRows(db: DatabaseSync, input: NoteSearchQuery, ftsAvailable: boolean): NoteSearchRow[] {
  const { sql, params } = conditions(input);
  const columns = `SELECT id, title, content, excerpt, icon, cover_asset_id, parent_id, folder_id, sort_order, favorite, archived, created_at, updated_at FROM notes`;
  if (ftsAvailable) {
    try {
      const match = ftsMatch(input.q, input.titleOnly);
      const rows = db.prepare(`${columns} WHERE ${[...sql, "rowid IN (SELECT rowid FROM notes_fts WHERE notes_fts MATCH ?)"].join(" AND ")} ORDER BY updated_at DESC LIMIT 500`)
        .all(...params, match) as unknown as NoteSearchRow[];
      // FTS findet nur exakte Präfixe. Für Tippfehler und ähnliche Titel bleibt
      // der Vollscan die Kandidatenquelle für das unscharfe Ranking.
      if (rows.length > 0) return rows;
    } catch {
      // Ungültige FTS-Syntax oder fehlender Index: Vollscan unten.
    }
  }
  return db.prepare(`${columns} WHERE ${sql.join(" AND ")} ORDER BY updated_at DESC`)
    .all(...params) as unknown as NoteSearchRow[];
}
