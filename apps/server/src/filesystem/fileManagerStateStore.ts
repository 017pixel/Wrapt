import type { DatabaseSync } from "node:sqlite";
import {
  fileManagerStateResponseSchema,
  fileManagerStateSchema,
  type FileManagerState,
  type FileManagerStateResponse,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { safeJsonDocument } from "../utils/jsonQuarantine.js";

interface StateRow {
  id: number;
  document_json: string;
  revision: number;
  updated_at: string;
}

/**
 * Serverseitiger Dateimanager-Zustand (Verlauf, Favoriten, Ansicht).
 * Liegt in derselben SQLite wie der Dateimanager selbst; beschädigte
 * Dokumente werden quarantänisiert und als Standardzustand geliefert.
 */
export class FileManagerStateStore {
  constructor(private readonly db: DatabaseSync, private readonly root: string) {
    this.db.exec(`CREATE TABLE IF NOT EXISTS file_manager_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      document_json TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );`);
  }

  private defaultState(): FileManagerState {
    return { currentPath: this.root, history: [], favorites: [], viewMode: "list", sortKey: "name", sortDirection: "asc" };
  }

  private readState(): { document: FileManagerState; revision: number; updatedAt: string } {
    const row = this.db.prepare("SELECT id, document_json, revision, updated_at FROM file_manager_state WHERE id = 1").get() as StateRow | undefined;
    const fallback = this.defaultState();
    if (!row) return { document: fallback, revision: 0, updatedAt: new Date(0).toISOString() };
    const document = safeJsonDocument(this.db, "file_manager_state", "1", row.document_json, (value) => fileManagerStateSchema.parse(value), fallback);
    if (document === fallback) return { document, revision: 0, updatedAt: new Date(0).toISOString() };
    return { document, revision: row.revision, updatedAt: row.updated_at };
  }

  state(): FileManagerStateResponse {
    const { document, revision, updatedAt } = this.readState();
    return fileManagerStateResponseSchema.parse({ document, revision, updatedAt });
  }

  async saveState(input: { document: FileManagerState; expectedRevision: number | null }): Promise<FileManagerStateResponse> {
    let revision: number;
    let updatedAt: string;
    let committed = false;
    try {
      this.db.exec("BEGIN IMMEDIATE");
    } catch (error) {
      if (String((error as Error).message).includes("SQLITE_BUSY")) {
        throw new AppError(409, "FILE_MANAGER_STATE_BUSY", "Der Dateimanager-Zustand wird gerade von einem anderen Schreiber geändert.", { revision: null }, true);
      }
      throw error;
    }
    try {
      // Revision lesen und schreiben müssen unter derselben Schreibsperre
      // laufen. Sonst können zwei Schreiber denselben Stand lesen und der
      // spätere Save überschreibt die Änderung des ersten (Lost Update).
      const current = this.readState();
      const matches = input.expectedRevision === null ? current.revision === 0 : input.expectedRevision === current.revision;
      if (!matches) {
        throw new AppError(409, "FILE_MANAGER_STATE_CONFLICT", "Der Dateimanager-Zustand wurde parallel geändert. Bitte neu laden.", {
          revision: current.revision,
        });
      }
      revision = current.revision + 1;
      updatedAt = new Date().toISOString();
      this.db.prepare(
        `INSERT INTO file_manager_state (id, document_json, revision, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET document_json = excluded.document_json, revision = excluded.revision, updated_at = excluded.updated_at`,
      ).run(JSON.stringify(input.document), revision, updatedAt);
      this.db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    return fileManagerStateResponseSchema.parse({ document: input.document, revision, updatedAt });
  }
}
