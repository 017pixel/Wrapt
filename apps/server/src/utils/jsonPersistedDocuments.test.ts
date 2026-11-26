import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { TerminalDatabase } from "../terminal/database.js";
import { FileManagerService } from "../filesystem/fileManagerService.js";
import { WorkspaceRegistryDatabase } from "../workspaces/database.js";
import { PreviewSlotDatabase } from "../previews/database.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

function path() {
  const root = mkdtempSync(join(tmpdir(), "json-quarantine-"));
  roots.push(root);
  return join(root, "wrapt.sqlite");
}

function corrupt(databasePath: string, statement: string) {
  const db = new DatabaseSync(databasePath);
  db.exec(statement);
  db.close();
}

function quarantined(databasePath: string) {
  const db = new DatabaseSync(databasePath);
  const row = db.prepare("SELECT COUNT(*) AS count FROM json_quarantine").get() as { count: number };
  db.close();
  return row.count;
}

it("liefert für ein beschädigtes Terminal-Layout den Standardzustand statt 500", () => {
  const databasePath = path();
  const db = new TerminalDatabase(databasePath);
  corrupt(databasePath, `INSERT INTO terminal_workspaces(owner_id, document_json, revision, updated_at)
    VALUES ('alice', '{kaputt', 7, '2026-11-19T00:00:00.000Z')`);
  const workspace = db.getWorkspace("alice");
  expect(workspace.revision).toBe(0);
  expect(workspace.document.version).toBe(2);
  expect(quarantined(databasePath)).toBeGreaterThan(0);
  db.close();
});

it("liefert für einen beschädigten Dateimanager-Zustand den Standardzustand", async () => {
  const databasePath = path();
  const root = mkdtempSync(join(tmpdir(), "json-quarantine-root-"));
  roots.push(root);
  const service = new FileManagerService(root, 1_000, 1_000, databasePath);
  corrupt(databasePath, `INSERT INTO file_manager_state(id, document_json, revision, updated_at)
    VALUES (1, '{"favorites": "kaputt"}', 9, '2026-11-19T00:00:00.000Z')`);
  const state = await service.state();
  expect(state.revision).toBe(0);
  expect(Array.isArray(state.document.favorites)).toBe(true);
  expect(quarantined(databasePath)).toBeGreaterThan(0);
  service.close();
});

it("liefert für ein beschädigtes Workspace-Register einen leeren Stand", () => {
  const databasePath = path();
  const db = new WorkspaceRegistryDatabase(databasePath);
  corrupt(databasePath, `INSERT INTO workspace_registries(owner_id, document_json, revision, updated_at)
    VALUES ('alice', 'kein json', 3, '2026-11-19T00:00:00.000Z')`);
  const registry = db.getRegistry("alice");
  expect(registry.document.entries).toEqual([]);
  expect(quarantined(databasePath)).toBeGreaterThan(0);
  db.close();
});

it("überspringt beschädigte Preview-Kandidaten und -Graphen", () => {
  const databasePath = path();
  const db = new PreviewSlotDatabase(databasePath);
  corrupt(databasePath, `INSERT INTO preview_service_candidates(service_id, project_id, port, payload, detected_at)
    VALUES ('web', 'demo', 5173, '{"serviceId": 1}', '2026-11-19T00:00:00.000Z');
    INSERT INTO preview_service_graphs(project_id, primary_service_id, edges, updated_at)
    VALUES ('demo', 'web', '["kaputt"]', '2026-11-19T00:00:00.000Z')`);
  expect(db.candidates(null)).toEqual([]);
  expect(db.serviceGraph("demo", "web")).toBeNull();
  expect(quarantined(databasePath)).toBeGreaterThan(0);
  db.close();
});
