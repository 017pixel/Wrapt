import type { DatabaseSync } from "node:sqlite";

/**
 * Beschädigte persistierte JSON-Dokumente dürfen eine Funktion nicht dauerhaft
 * mit 500 blockieren. Der Rohwert bleibt für die Diagnose erhalten, der
 * Lesepfad liefert stattdessen einen definierten Fallback.
 */
export function createJsonQuarantine(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS json_quarantine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      document_key TEXT NOT NULL,
      raw TEXT NOT NULL,
      error TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(source, document_key, raw)
    );
    CREATE INDEX IF NOT EXISTS json_quarantine_created ON json_quarantine(created_at DESC);
  `);
}

const QUARANTINE_LIMIT = 200;

function quarantine(db: DatabaseSync, source: string, documentKey: string, raw: string, error: string): void {
  try {
    createJsonQuarantine(db);
    db.prepare("INSERT OR IGNORE INTO json_quarantine(source, document_key, raw, error, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(source, documentKey, raw, error, new Date().toISOString());
    db.prepare(`DELETE FROM json_quarantine WHERE id NOT IN (
      SELECT id FROM json_quarantine ORDER BY id DESC LIMIT ${QUARANTINE_LIMIT}
    )`).run();
  } catch {
    // Die Quarantäne ist Diagnose; sie darf den Lesepfad nicht erneut brechen.
  }
  console.warn(`[json-quarantäne] ${source}/${documentKey}: ${error}`);
}

/** JSON parsen und gegen ein Schema prüfen, mit Quarantäne und Fallback. */
export function safeJsonDocument<T>(
  db: DatabaseSync,
  source: string,
  documentKey: string,
  raw: string,
  parse: (value: unknown) => T,
  fallback: T,
): T {
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch (error) {
    quarantine(db, source, documentKey, raw, error instanceof Error ? error.message : String(error));
    return fallback;
  }
}

/** Einzelne beschädigte Zeilen überspringen, ohne den gesamten Abruf zu beenden. */
export function safeJsonRow<T>(
  db: DatabaseSync,
  source: string,
  documentKey: string,
  raw: string,
  parse: (value: unknown) => T,
): T | null {
  try {
    return parse(JSON.parse(raw) as unknown);
  } catch (error) {
    quarantine(db, source, documentKey, raw, error instanceof Error ? error.message : String(error));
    return null;
  }
}
