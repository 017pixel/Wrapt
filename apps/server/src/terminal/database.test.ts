import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../utils/errors.js";
import { TerminalDatabase } from "./database.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function database() {
  const directory = await mkdtemp(join(tmpdir(), "workbench-terminal-db-"));
  directories.push(directory);
  return new TerminalDatabase(join(directory, "workbench.sqlite"));
}

describe("TerminalDatabase", () => {
  it("stores independent per-user workspaces with optimistic revisions", async () => {
    const db = await database();
    expect(db.getWorkspace("alice").revision).toBe(0);
    const document = {
      version: 2 as const,
      entries: [],
      folders: [],
      areaLayouts: {},
    };
    const saved = db.saveWorkspace("alice", document, 0);
    expect(saved.revision).toBe(1);
    expect(db.getWorkspace("alice")).toMatchObject({ revision: 1, document });
    expect(db.getWorkspace("bob").revision).toBe(0);
    expect(() => db.saveWorkspace("alice", document, 0)).toThrowError(AppError);
    expect(() => db.saveWorkspace("alice", document, 0)).toThrowError(/anderen Gerät/);
    db.close();
  });

  it("marks running records interrupted when a backend starts again", async () => {
    const db = await database();
    db.saveSession({
      id: "00000000-0000-4000-8000-000000000001",
      userId: "alice",
      runtimeId: "00000000-0000-4000-8000-000000000002",
      kind: "shell",
      mode: "agent",
      projectId: null,
      profilePath: null,
      supervisorName: null,
      cwd: "/tmp",
      pid: 123,
      cols: 80,
      rows: 24,
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      exitCode: null,
      exitSignal: null,
      epoch: 0,
    });
    db.markRunningSessionsInterrupted();
    expect(db.listSessions("alice", () => 0)[0]).toMatchObject({ status: "interrupted", pid: 123 });
    db.close();
  });

  it("migrates a stored V1 workspace on read and keeps saveWorkspace working", async () => {
    const db = await database();
    const internal = db as unknown as { db: { prepare: (sql: string) => { run: (...params: (string | number)[]) => void } } };
    // V1-Dokument direkt in die Tabelle schreiben, wie es vor der V2-
    // Einführung gespeichert wurde.
    internal.db.prepare("INSERT INTO terminal_workspaces(owner_id, document_json, revision, updated_at) VALUES (?, ?, ?, ?)").run(
      "alice",
      JSON.stringify({
        version: 1,
        areas: {
          standalone: {
            id: "standalone",
            tabs: [
              { id: "11111111-1111-4111-8111-111111111111", projectId: "projekt", kind: "shell", initialCwd: "/tmp" },
            ],
            activeTabId: "11111111-1111-4111-8111-111111111111",
            splitTabIds: null,
            splitSizes: [50, 50],
          },
        },
      }),
      7,
      "2026-08-19T08:00:00.000Z",
    );

    // Lesen migriert einmalig nach V2 und erhöht die Revision.
    const migrated = db.getWorkspace("alice");
    expect(migrated.document.version).toBe(2);
    expect(migrated.revision).toBe(8);
    expect(migrated.document.entries).toHaveLength(1);
    expect(migrated.document.entries[0]!.runtimeId).toBe("11111111-1111-4111-8111-111111111111");

    // Weitere Lesevorgänge bleiben stabil.
    expect(db.getWorkspace("alice").revision).toBe(8);

    // saveWorkspace darf nach der Migration keine Transaktionsrekursion
    // mehr auslösen (Regression: "cannot start a transaction within a transaction").
    const saved = db.saveWorkspace("alice", migrated.document, 8);
    expect(saved.revision).toBe(9);
    expect(db.getWorkspace("alice").revision).toBe(9);
    db.close();
  });
});

describe("Workspace-Änderungen", () => {
  const runtime = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
  const document = (...runtimeIds: string[]) => ({
    version: 2 as const,
    entries: runtimeIds.map((runtimeId, index) => ({
      id: `entry-${index}`, runtimeId, name: `Terminal ${index}`, parentFolderId: null,
      sortOrder: index, pinned: false, persistent: false, kind: "shell" as const, projectId: null, initialCwd: null,
    })),
    folders: [{ id: "default", parentFolderId: null, name: "Terminal", sortOrder: 0, collapsed: false }],
    areaLayouts: {},
  });

  it("meldet entfernte Runtime-IDs und behält wiederverwendete", async () => {
    const db = await database();
    const changes: Array<{ userId: string; removedRuntimeIds: readonly string[] | null }> = [];
    db.onWorkspaceChange((change) => changes.push(change));
    const first = runtime("1");
    const second = runtime("2");
    const third = runtime("3");

    db.saveWorkspace("alice", document(first, second), 0);
    expect(changes.at(-1)).toEqual({ userId: "alice", removedRuntimeIds: [] });
    db.saveWorkspace("alice", document(second, third), 1);
    expect(changes.at(-1)).toEqual({ userId: "alice", removedRuntimeIds: [first] });
    expect(db.isRuntimeReferenced("alice", second)).toBe(true);
    expect(db.isRuntimeReferenced("alice", first)).toBe(false);
    db.close();
  });

  it("meldet bei unlesbarem Altstand keine Löschungen und lässt den Reset zu", async () => {
    const db = await database();
    const internal = db as unknown as { db: { prepare: (sql: string) => { run: (...params: (string | number)[]) => void } } };
    internal.db.prepare("INSERT INTO terminal_workspaces(owner_id, document_json, revision, updated_at) VALUES (?, ?, ?, ?)").run(
      "alice", "{ kaputt", 4, "2026-08-19T08:00:00.000Z",
    );
    const changes: Array<{ userId: string; removedRuntimeIds: readonly string[] | null }> = [];
    db.onWorkspaceChange((change) => changes.push(change));

    const saved = db.saveWorkspace("alice", document(), 4);
    expect(saved.revision).toBe(5);
    expect(changes.at(-1)).toEqual({ userId: "alice", removedRuntimeIds: null });
    // Der bewusste Reset darf trotz unlesbarem Altstand nicht in einen
    // Revisionskonflikt laufen.
    expect(db.resetWorkspace("alice").revision).toBe(6);
    db.close();
  });
});
