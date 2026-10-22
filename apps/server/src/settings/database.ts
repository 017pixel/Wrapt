import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  UI_SETTINGS_LIMITS,
  uiSettingsDocumentSchema,
  type SaveUiSettingsRequest,
  type UiSettingEntry,
  type UiSettingKey,
  type UiSettingValue,
  type UiSettingsDocument,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";

interface DocumentRow { documentJson: string; revision: number; updatedAt: string; }

const EMPTY_DOCUMENT: UiSettingsDocument = {
  version: 1,
  revision: 0,
  updatedAt: new Date(0).toISOString(),
  entries: {},
};

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "null", "utf8");
}
function parseDocument(raw: string): UiSettingsDocument {
  try {
    return uiSettingsDocumentSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    // Ein beschädigtes Dokument darf die Anmeldung nicht blockieren. Beim
    // nächsten Schreiben entsteht wieder ein gültiger Stand; die Client-
    // Speicher bleiben unberührt und werden erneut hochgeladen.
    return EMPTY_DOCUMENT;
  }
}

/**
 * Client-Einstellungen pro Workbench-Identität. Das Dokument wird als Ganzes
 * gespeichert, einzelne Schlüssel tragen aber ihre eigene Revision. Dadurch
 * kann ein Gerät eine Einstellung ändern, ohne die zuletzt von einem anderen
 * Gerät geänderte Einstellung zu überschreiben.
 */
export class UiSettingsDatabase {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ui_settings (
        owner_id TEXT PRIMARY KEY,
        document_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  close() { this.db.close(); }

  get(userId: string): UiSettingsDocument {
    return this.read(userId);
  }

  save(userId: string, request: SaveUiSettingsRequest) {
    // Doppelte Schlüssel im selben Aufruf: der letzte Wert gewinnt.
    const changes = new Map<UiSettingKey, UiSettingValue>();
    for (const change of request.changes) changes.set(change.key, change.value);
    for (const value of changes.values()) {
      if (byteLength(value) > UI_SETTINGS_LIMITS.maxValueBytes) {
        throw new AppError(413, "UI_SETTING_TOO_LARGE", "Eine Einstellung ist zu groß für den Server.");
      }
    }

    let document: UiSettingsDocument;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.read(userId);
      const now = new Date().toISOString();
      const revision = current.revision + 1;
      const entries: Partial<Record<UiSettingKey, UiSettingEntry>> = { ...current.entries };
      for (const [key, value] of changes) {
        entries[key] = { value, revision, updatedAt: now };
      }
      document = uiSettingsDocumentSchema.parse({
        version: 1,
        revision,
        updatedAt: now,
        entries,
      });
      const documentJson = JSON.stringify(document);
      if (Buffer.byteLength(documentJson, "utf8") > UI_SETTINGS_LIMITS.maxDocumentBytes) {
        throw new AppError(413, "UI_SETTINGS_DOCUMENT_TOO_LARGE", "Die Einstellungen sind zu groß für den Server.");
      }
      this.db.prepare(`INSERT INTO ui_settings(owner_id, document_json, revision, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET document_json=excluded.document_json,
        revision=excluded.revision, updated_at=excluded.updated_at`)
        .run(userId, documentJson, revision, now);
      this.db.exec("COMMIT");
    } catch (error) {
      if (this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }

    return document;
  }

  private read(userId: string): UiSettingsDocument {
    const row = this.db.prepare(
      "SELECT document_json documentJson, revision, updated_at updatedAt FROM ui_settings WHERE owner_id = ?",
    ).get(userId) as DocumentRow | undefined;
    return row ? parseDocument(row.documentJson) : EMPTY_DOCUMENT;
  }
}
