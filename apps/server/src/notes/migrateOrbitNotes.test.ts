import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { orbitWorkspaceSchema } from "@wrapt/contracts";
import { OrbitDatabase } from "../orbit/database.js";
import { NotesDatabase } from "./database.js";
import { migrateOrbitNotesToNotes } from "./migrateOrbitNotes.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "wrapt-notes-migration-"));
  directories.push(directory);
  const databasePath = join(directory, "wrapt.sqlite");
  return {
    orbit: new OrbitDatabase(databasePath),
    notes: new NotesDatabase(databasePath),
    databasePath,
  };
}

function workspaceWithNotes() {
  return orbitWorkspaceSchema.parse({
    version: 6,
    activeBoardId: "board-1",
    focusedNodeId: null,
    boards: [
      {
        id: "board-1",
        name: "Arbeitsfläche",
        viewport: { x: 0, y: 0, zoom: 1 },
        worldBounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
        nodes: [
          {
            id: "note-1",
            type: "note",
            title: "Einkaufsliste",
            position: { x: 0, y: 0 },
            size: { width: 240, height: 160 },
            projectId: null,
            parentId: null,
            runtimeId: null,
            toolType: null,
            previewId: null,
            previewDeviceId: null,
            content: "# Einkauf\n\n- Milch",
            language: null,
            provider: null,
            locked: false,
            zIndex: 1,
          },
          {
            id: "todo-1",
            type: "todo",
            title: "Aufgaben",
            position: { x: 300, y: 0 },
            size: { width: 240, height: 160 },
            projectId: null,
            parentId: null,
            runtimeId: null,
            toolType: null,
            previewId: null,
            previewDeviceId: null,
            content: JSON.stringify({ version: 1, items: [
              { id: "task-1", text: "Test", done: false, dueDate: "2026-09-30", priority: "hoch" },
              { id: "task-2", text: "Review", done: true },
            ] }),
            language: null,
            provider: null,
            locked: false,
            zIndex: 2,
          },
        ],
        edges: [{ id: "todo-link", source: "note-1", target: "todo-1", kind: "manual", label: null }],
      },
    ],
  });
}

describe("Migration der Orbit-Notizen", () => {
  it("überführt Notizen und To-dos global, erhält Inhalte und bleibt idempotent", async () => {
    const { orbit, notes } = await setup();
    const original = workspaceWithNotes();
    const originalTodo = original.boards[0]!.nodes.find((node) => node.id === "todo-1")!.content;
    orbit.save(original, 0);

    const first = migrateOrbitNotesToNotes(orbit, notes);
    expect(first.migratedNodes).toBe(1);
    expect(first.migratedTodos).toBe(1);

    const list = notes.list();
    expect(list).toHaveLength(2);
    const note = notes.get(list.find((candidate) => candidate.title === "Einkaufsliste")!.id)!;
    expect(note.content).toContain("- Milch");
    const taskNote = notes.get(list.find((candidate) => candidate.title === "Aufgaben")!.id)!;
    expect(taskNote.parentId).toBeNull();
    expect(taskNote.content).toContain("- [ ] Test");
    expect(taskNote.content).toContain("ID: task-1");
    expect(taskNote.content).toContain("Fällig am: 2026-09-30");
    expect(taskNote.content).toContain("Priorität: hoch");
    expect(taskNote.content.indexOf("- [ ] Test")).toBeLessThan(taskNote.content.indexOf("- [x] Review"));

    const saved = orbit.get();
    const migrated = saved.document.boards[0]!.nodes.find((candidate) => candidate.id === "note-1");
    expect(migrated).toMatchObject({ type: "note", noteId: note.id });
    const migratedBoard = saved.document.boards[0]!;
    expect(migratedBoard.nodes.some((candidate) => candidate.id === "todo-1")).toBe(false);
    expect(migratedBoard.edges.some((edge) => edge.source === "todo-1" || edge.target === "todo-1")).toBe(false);

    const raw = new DatabaseSync(join(directories[0]!, "wrapt.sqlite"), { readOnly: true });
    const archivedSource = raw.prepare("SELECT source_content sourceContent FROM note_source_migrations WHERE source_id=?")
      .get('orbit:v1:["todo","board-1","todo-1"]') as { sourceContent: string };
    expect(archivedSource.sourceContent).toBe(originalTodo);
    raw.close();

    const second = migrateOrbitNotesToNotes(orbit, notes);
    expect(second.migratedNodes).toBe(0);
    expect(second.migratedTodos).toBe(0);
    expect(notes.list()).toHaveLength(2);
    orbit.close();
    notes.close();
  });

  it("überspringt ein leeres, nicht initialisiertes Dokument", async () => {
    const { orbit, notes } = await setup();
    expect(migrateOrbitNotesToNotes(orbit, notes).migratedNodes).toBe(0);
    orbit.close();
    notes.close();
  });

  it("rollt Zielnotizen und Orbit-Verweise gemeinsam zurück und kann sicher erneut laufen", async () => {
    const { orbit, notes, databasePath } = await setup();
    orbit.save(workspaceWithNotes(), 0);
    const before = orbit.get();
    const raw = new DatabaseSync(databasePath);
    raw.exec(`CREATE TRIGGER reject_notes_migration
      BEFORE UPDATE OF document_json ON orbit_documents
      BEGIN SELECT RAISE(ABORT, 'fixture migration failure'); END`);

    expect(() => notes.migrateOrbitSources()).toThrow(/fixture migration failure/);
    expect(notes.list()).toEqual([]);
    expect(orbit.get().revision).toBe(before.revision);
    expect(orbit.get().document.boards[0]!.nodes.find((node) => node.id === "note-1")?.noteId).toBeNull();
    expect(orbit.get().document.boards[0]!.nodes.find((node) => node.id === "todo-1")?.type).toBe("todo");
    expect(orbit.get().document.boards[0]!.edges).toHaveLength(1);

    raw.exec("DROP TRIGGER reject_notes_migration");
    const retry = migrateOrbitNotesToNotes(orbit, notes);
    expect(retry.migratedNodes).toBe(1);
    expect(retry.migratedTodos).toBe(1);
    expect(notes.list()).toHaveLength(2);
    expect(orbit.get().revision).toBe(before.revision + 1);
    expect(orbit.get().document.boards[0]!.nodes.some((node) => node.id === "todo-1")).toBe(false);
    raw.close();
    orbit.close();
    notes.close();
  });
});
