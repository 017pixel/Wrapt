import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { orbitWorkspaceSchema, type OrbitNode, type OrbitWorkspace } from "@wrapt/contracts";
import { settings } from "../config/settings.js";
import { orbitTodoMarkdown } from "./orbitTodoMarkdown.js";

interface OrbitRow {
  documentJson: string;
  revision: number;
  initialized: number;
}

interface MigrationRow {
  sourceId: string;
  noteId: string;
  sourceHash: string;
  sourceType: "note" | "todo";
  sourceTitle: string;
  sourceContent: string;
  importedTitle: string;
  importedContent: string;
}

interface SourceToImport {
  sourceId: string;
  boardId: string;
  nodeId: string;
  node: OrbitNode;
  sourceType: "note" | "todo";
  title: string;
  sourceContent: string;
  importedContent: string;
}

export interface OrbitNotesMigrationResult {
  migratedNotes: number;
  migratedTodos: number;
  migratedBoards: number;
  revision: number | null;
  references: Array<{ boardId: string; nodeId: string; noteId: string; sourceType: "note" | "todo" }>;
}

function hashSource(source: Pick<SourceToImport, "sourceType" | "title" | "sourceContent">): string {
  return createHash("sha256")
    .update(JSON.stringify([source.sourceType, source.title, source.sourceContent]))
    .digest("hex");
}

function stableNoteId(sourceId: string): string {
  const bytes = createHash("sha256").update(`wrapt-notes:${sourceId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function extractSources(document: OrbitWorkspace): SourceToImport[] {
  const sources: SourceToImport[] = [];
  for (const board of document.boards) {
    for (const node of board.nodes) {
      const sourceType = node.type === "todo" ? "todo" : node.type === "note" && node.noteId === null ? "note" : null;
      if (sourceType === null) continue;
      const sourceId = `orbit:v1:${JSON.stringify([sourceType, board.id, node.id])}`;
      const sourceContent = node.content;
      sources.push({
        sourceId,
        boardId: board.id,
        nodeId: node.id,
        node,
        sourceType,
        title: node.title,
        sourceContent,
        importedContent: sourceType === "todo" ? orbitTodoMarkdown(sourceContent) : sourceContent,
      });
    }
  }
  return sources;
}

function verifyTarget(database: DatabaseSync, source: SourceToImport, noteId: string): void {
  const note = database.prepare("SELECT title, content, parent_id parentId FROM notes WHERE id=?")
    .get(noteId) as { title: string; content: string; parentId: string | null } | undefined;
  if (!note || note.title !== source.title || note.content !== source.importedContent || note.parentId !== null) {
    throw new Error(`Notes-Migration für ${source.sourceId} konnte nicht verifiziert werden.`);
  }
}

function nextRootOrder(database: DatabaseSync): number {
  const row = database.prepare("SELECT MAX(sort_order) maxOrder FROM notes WHERE parent_id IS NULL")
    .get() as { maxOrder: number | null };
  return (row.maxOrder ?? 0) + 1;
}

function importSource(database: DatabaseSync, source: SourceToImport): string {
  const existing = database.prepare(`SELECT source_id sourceId, target_note_id noteId, source_hash sourceHash,
      source_type sourceType, source_title sourceTitle, source_content sourceContent,
      imported_title importedTitle, imported_content importedContent
    FROM note_source_migrations WHERE source_id=?`).get(source.sourceId) as MigrationRow | undefined;
  if (existing) {
    const target = database.prepare("SELECT title, content, revision FROM notes WHERE id=?")
      .get(existing.noteId) as { title: string; content: string; revision: number } | undefined;
    if (!target) throw new Error(`Die Zielnotiz für ${source.sourceId} fehlt; die Quelle bleibt erhalten.`);
    const sourceChanged = existing.sourceHash !== hashSource(source);
    const targetStillImported = target.title === existing.importedTitle && target.content === existing.importedContent;
    if (sourceChanged && !targetStillImported) {
      throw new Error(`Quelle und Zielnotiz für ${source.sourceId} wurden gleichzeitig geändert; Migration sicher angehalten.`);
    }
    if (sourceChanged) {
      database.prepare(`UPDATE notes SET title=?, content=?, revision=revision+1, updated_at=? WHERE id=?`)
        .run(source.title, source.importedContent, new Date().toISOString(), existing.noteId);
      database.prepare(`UPDATE note_source_migrations SET source_hash=?, source_type=?, source_title=?, source_content=?,
          imported_title=?, imported_content=?, migrated_at=? WHERE source_id=?`)
        .run(hashSource(source), source.sourceType, source.title, source.sourceContent, source.title,
          source.importedContent, new Date().toISOString(), source.sourceId);
    }
    verifyTarget(database, source, existing.noteId);
    return existing.noteId;
  }

  let noteId = stableNoteId(source.sourceId);
  if (database.prepare("SELECT 1 FROM notes WHERE id=?").get(noteId)) noteId = randomUUID();
  const now = new Date().toISOString();
  database.prepare(`INSERT INTO notes(id,title,content,parent_id,sort_order,favorite,archived,revision,created_at,updated_at)
    VALUES(?,?,?,NULL,?,0,0,1,?,?)`)
    .run(noteId, source.title, source.importedContent, nextRootOrder(database), now, now);
  database.prepare(`INSERT INTO note_source_migrations(
    source_id,target_note_id,source_hash,source_type,source_title,source_content,imported_title,imported_content,migrated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)`).run(
    source.sourceId,
    noteId,
    hashSource(source),
    source.sourceType,
    source.title,
    source.sourceContent,
    source.title,
    source.importedContent,
    now,
  );
  verifyTarget(database, source, noteId);
  return noteId;
}

function orbitTablesExist(database: DatabaseSync): boolean {
  const count = database.prepare(`SELECT COUNT(*) count FROM sqlite_master
    WHERE type='table' AND name IN ('orbit_documents','orbit_document_revisions','orbit_backup_outbox')`)
    .get() as { count: number };
  return count.count === 3;
}

/** Notes-Erweiterung und Orbit-Verweise werden in derselben SQLite-Transaktion geändert. */
export function migrateOrbitSources(database: DatabaseSync): OrbitNotesMigrationResult {
  if (!orbitTablesExist(database)) {
    return { migratedNotes: 0, migratedTodos: 0, migratedBoards: 0, revision: null, references: [] };
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const current = database.prepare(`SELECT document_json documentJson, revision, initialized
      FROM orbit_documents WHERE id='default'`).get() as OrbitRow | undefined;
    if (!current || current.initialized !== 1) {
      database.exec("COMMIT");
      return { migratedNotes: 0, migratedTodos: 0, migratedBoards: 0, revision: null, references: [] };
    }

    const document = orbitWorkspaceSchema.parse(JSON.parse(current.documentJson) as unknown);
    const sources = extractSources(document);
    if (sources.length === 0) {
      database.exec("COMMIT");
      return { migratedNotes: 0, migratedTodos: 0, migratedBoards: 0, revision: current.revision, references: [] };
    }

    const references: OrbitNotesMigrationResult["references"] = [];
    const migratedBoards = new Set<string>();
    const todoNodeIds = new Map<string, Set<string>>();
    let migratedNotes = 0;
    let migratedTodos = 0;
    for (const source of sources) {
      const noteId = importSource(database, source);
      migratedBoards.add(source.boardId);
      if (source.sourceType === "todo") {
        migratedTodos += 1;
        const boardNodes = todoNodeIds.get(source.boardId) ?? new Set<string>();
        boardNodes.add(source.nodeId);
        todoNodeIds.set(source.boardId, boardNodes);
        references.push({ boardId: source.boardId, nodeId: source.nodeId, noteId, sourceType: "todo" });
      } else {
        source.node.type = "note";
        source.node.noteId = noteId;
        references.push({ boardId: source.boardId, nodeId: source.nodeId, noteId, sourceType: "note" });
        migratedNotes += 1;
      }
    }
    for (const board of document.boards) {
      const removed = todoNodeIds.get(board.id);
      if (!removed) continue;
      board.nodes = board.nodes.filter((node) => !removed.has(node.id));
      board.edges = board.edges.filter((edge) => !removed.has(edge.source) && !removed.has(edge.target));
    }

    const parsed = orbitWorkspaceSchema.parse(document);
    const documentJson = JSON.stringify(parsed);
    if (Buffer.byteLength(documentJson, "utf8") > settings.orbitDocumentMaxBytes) {
      throw new Error("Die Orbit-Notizenmigration überschreitet die erlaubte Dokumentgröße; Quelldaten bleiben unverändert.");
    }
    const revision = current.revision + 1;
    const updatedAt = new Date().toISOString();
    const update = database.prepare(`UPDATE orbit_documents SET document_json=?, revision=?, updated_at=?
      WHERE id='default' AND revision=?`).run(documentJson, revision, updatedAt, current.revision);
    if (update.changes !== 1) throw new Error("Die Orbit-Revision änderte sich während der Notes-Migration; bitte erneut versuchen.");
    database.prepare(`INSERT INTO orbit_document_revisions(revision,document_json,created_at,source)
      VALUES(?,?,?,'notes-migration')`).run(revision, documentJson, updatedAt);
    database.prepare(`INSERT INTO orbit_backup_outbox(revision,attempts,last_error,updated_at)
      VALUES(?,0,NULL,?)`).run(revision, updatedAt);
    database.exec("COMMIT");
    return { migratedNotes, migratedTodos, migratedBoards: migratedBoards.size, revision, references };
  } catch (error) {
    if (database.isTransaction) database.exec("ROLLBACK");
    throw error;
  }
}
