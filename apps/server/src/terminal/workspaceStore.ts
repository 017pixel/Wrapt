import type { DatabaseSync } from "node:sqlite";
import {
  terminalWorkspaceSchema,
  terminalWorkspaceV2Schema,
  type TerminalWorkspaceV2,
} from "@wrapt/contracts";
import { AppError } from "../utils/errors.js";
import { safeJsonDocument, safeJsonRow } from "../utils/jsonQuarantine.js";
import { emptyTerminalWorkspaceV2, migrateTerminalWorkspaceV1 } from "./workspace/terminalWorkspaceMigrations.js";

export interface TerminalWorkspaceChange {
  userId: string;
  /** null bedeutet, dass das alte Dokument nicht sicher lesbar war. */
  removedRuntimeIds: readonly string[] | null;
}

export type TerminalWorkspaceChangeListener = (change: TerminalWorkspaceChange) => void;

interface WorkspaceRow { documentJson: string; revision: number; updatedAt: string; }

const DEFAULT_WORKSPACE: TerminalWorkspaceV2 = emptyTerminalWorkspaceV2();

/**
 * Persistenz der Terminal-Layouts. Getrennt von der Sitzungs-Registry, weil
 * Workspace-Saves eigene Transaktionen, Migrationen und Änderungsmeldungen
 * besitzen. Die Sitzungs-Registry liest daraus nur Referenzen.
 */
export class TerminalWorkspaceStore {
  /** Owner mit unlesbarem Workspace-Dokument; verhindert Datenverlust beim Aufräumen. */
  private readonly corruptWorkspaces = new Set<string>();
  private readonly listeners = new Set<TerminalWorkspaceChangeListener>();

  constructor(private readonly db: DatabaseSync) {}

  /** Meldet entfernte Runtime-IDs nach einem gespeicherten Workspace. Der
   *  Aufrufer bekommt keine Garantie über den Zeitpunkt; er kann die Arbeit
   *  über `drainWorkspaceCleanups()` abwarten. */
  onWorkspaceChange(listener: TerminalWorkspaceChangeListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Prüft, ob eine Runtime noch im aktuellen Workspace sichtbar ist. Eine
   *  unlesbare Ablage gilt als referenziert, damit nichts versehentlich fällt. */
  isRuntimeReferenced(userId: string, runtimeId: string): boolean {
    const runtimeIds = this.referencedRuntimeIds(userId);
    return runtimeIds === null || runtimeIds.includes(runtimeId);
  }

  /** Runtime-IDs, die im Workspace eines Nutzers sichtbar sind; null bei defektem Dokument. */
  referencedRuntimeIds(userId: string): string[] | null {
    if (this.corruptWorkspaces.has(userId)) return null;
    try {
      const document = this.getWorkspace(userId).document;
      return this.corruptWorkspaces.has(userId) ? null : document.entries.flatMap((entry) => entry.runtimeId ? [entry.runtimeId] : []);
    } catch {
      return null;
    }
  }

  getWorkspace(userId: string) {
    const found = this.readWorkspace(userId);
    if (!found) return { document: DEFAULT_WORKSPACE, revision: 0, updatedAt: new Date(0).toISOString() };
    // V1-Dokumente werden beim Lesen einmalig nach V2 migriert und zurück-
    // geschrieben. Das passiert bewusst als einzelnes atomares Statement und
    // nicht über saveWorkspace(), weil saveWorkspace() selbst die Revision
    // liest und eine Transaktion startet — ein Aufruf von dort würde in eine
    // laufende Transaktion hinein rekursieren (Fehler 500).
    if (found.raw.version === 1) {
      const migrated = safeJsonDocument(this.db, "terminal_workspaces", userId, found.row.documentJson, (value) => migrateTerminalWorkspaceV1(terminalWorkspaceSchema.parse(value)), null);
      if (!migrated) {
        this.corruptWorkspaces.add(userId);
        return { document: DEFAULT_WORKSPACE, revision: 0, updatedAt: new Date(0).toISOString() };
      }
      const revision = found.row.revision + 1;
      const updatedAt = new Date().toISOString();
      this.db.prepare(`INSERT INTO terminal_workspaces(owner_id, document_json, revision, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET document_json=excluded.document_json,
        revision=excluded.revision, updated_at=excluded.updated_at`).run(userId, JSON.stringify(migrated), revision, updatedAt);
      return { document: migrated, revision, updatedAt };
    }
    const document = safeJsonDocument(this.db, "terminal_workspaces", userId, found.row.documentJson, (value) => terminalWorkspaceV2Schema.parse(value), DEFAULT_WORKSPACE);
    if (document === DEFAULT_WORKSPACE && found.row.documentJson !== JSON.stringify(DEFAULT_WORKSPACE)) {
      // Beschädigtes Dokument: Der Client erhält einen nutzbaren Stand mit
      // Revision 0, damit ein bewusster Reset ohne Konfliktschleife möglich ist.
      this.corruptWorkspaces.add(userId);
      return { document: DEFAULT_WORKSPACE, revision: 0, updatedAt: new Date(0).toISOString() };
    }
    return { document, revision: found.row.revision, updatedAt: found.row.updatedAt };
  }

  /** Setzt ein beschädigtes oder unerwünschtes Layout bewusst zurück. */
  resetWorkspace(userId: string) {
    this.corruptWorkspaces.delete(userId);
    const row = this.db.prepare("SELECT revision FROM terminal_workspaces WHERE owner_id = ?").get(userId) as { revision: number } | undefined;
    return this.saveWorkspace(userId, DEFAULT_WORKSPACE, row?.revision ?? 0);
  }

  saveWorkspace(userId: string, document: TerminalWorkspaceV2, expectedRevision: number | null) {
    const parsed = terminalWorkspaceV2Schema.parse(document);
    let revision: number;
    let updatedAt: string;
    let previousRuntimeIds: Set<string> | null;
    let committed = false;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      // Revision und Dokument müssen unter derselben Schreibsperre gelesen
      // und geschrieben werden. Sonst können zwei Tabs denselben Stand lesen
      // und der spätere Save überschreibt die Änderung des ersten Tabs.
      // readWorkspace() statt getWorkspace(): getWorkspace() würde ein
      // V1-Dokument migrieren und dabei selbst schreiben — innerhalb der
      // laufenden Transaktion führt das zu einer zweiten Transaktion.
      const current = this.readWorkspace(userId);
      // Die Revision kommt direkt aus der Zeile: Ein beschädigtes Dokument
      // liefert kein lesbares current, darf aber über resetWorkspace() mit
      // seiner echten Revision überschrieben werden.
      const row = this.db.prepare("SELECT revision FROM terminal_workspaces WHERE owner_id = ?").get(userId) as { revision: number } | undefined;
      const currentRevision = row?.revision ?? 0;
      if (expectedRevision !== null && expectedRevision !== currentRevision) {
        throw new AppError(409, "TERMINAL_WORKSPACE_CONFLICT", "Das Terminal-Layout wurde auf einem anderen Gerät geändert.");
      }
      previousRuntimeIds = this.storedRuntimeIds(current, row !== undefined);
      revision = currentRevision + 1;
      updatedAt = new Date().toISOString();
      this.db.prepare(`INSERT INTO terminal_workspaces(owner_id, document_json, revision, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET document_json=excluded.document_json,
        revision=excluded.revision, updated_at=excluded.updated_at`).run(userId, JSON.stringify(parsed), revision, updatedAt);
      this.db.exec("COMMIT");
      committed = true;
    } catch (error) {
      if (!committed && this.db.isTransaction) this.db.exec("ROLLBACK");
      throw error;
    }
    if (previousRuntimeIds !== null) {
      const referenced = new Set(parsed.entries.flatMap((entry) => entry.runtimeId ? [entry.runtimeId] : []));
      this.notifyWorkspaceChange({
        userId,
        removedRuntimeIds: [...previousRuntimeIds].filter((runtimeId) => !referenced.has(runtimeId)),
      });
    } else {
      // Unlesbarer Altstand: lieber nichts beenden als eine lebende Sitzung
      // auf Verdacht zu schließen.
      this.notifyWorkspaceChange({ userId, removedRuntimeIds: null });
    }
    return { document: parsed, revision, updatedAt };
  }

  private notifyWorkspaceChange(change: TerminalWorkspaceChange): void {
    for (const listener of this.listeners) {
      try { listener(change); }
      catch { /* Ein Listener darf den gespeicherten Stand nicht blockieren. */ }
    }
  }

  private readWorkspace(userId: string): { row: WorkspaceRow; raw: { version?: unknown } } | null {
    const row = this.db.prepare("SELECT document_json documentJson, revision, updated_at updatedAt FROM terminal_workspaces WHERE owner_id = ?").get(userId) as WorkspaceRow | undefined;
    if (!row) return null;
    const raw = safeJsonRow(this.db, "terminal_workspaces", userId, row.documentJson, (value) => value as { version?: unknown });
    if (!raw || typeof raw !== "object") {
      this.corruptWorkspaces.add(userId);
      return null;
    }
    this.corruptWorkspaces.delete(userId);
    return { row, raw };
  }

  /** Runtime-IDs des bisherigen Dokuments; null, wenn es nicht sicher lesbar war. */
  private storedRuntimeIds(current: { raw: { version?: unknown } } | null, hadRow: boolean): Set<string> | null {
    if (!hadRow) return new Set();
    if (!current) return null;
    if (current.raw.version !== 2) return null;
    try {
      const document = terminalWorkspaceV2Schema.parse(current.raw);
      return new Set(document.entries.flatMap((entry) => entry.runtimeId ? [entry.runtimeId] : []));
    } catch {
      return null;
    }
  }
}
