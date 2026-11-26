import { describe, expect, it } from "vitest";
import type { TerminalWorkspaceV2 } from "@wrapt/contracts";
import { AppError } from "../../utils/errors.js";
import { TerminalWorkspaceService } from "./TerminalWorkspaceService.js";
import { emptyTerminalWorkspaceV2, migrateTerminalWorkspaceV1 } from "./terminalWorkspaceMigrations.js";

function baseDocument(): TerminalWorkspaceV2 {
  return {
    version: 2,
    entries: [],
    folders: [{ id: "default", parentFolderId: null, name: "Terminal", sortOrder: 0, collapsed: false }],
    areaLayouts: {},
  };
}

const service = new TerminalWorkspaceService();

describe("TerminalWorkspaceService", () => {
  it("legt Terminals in Ordnern an und verschiebt sie", () => {
    const withFolder = service.applyOperations(baseDocument(), [{
      type: "createFolder",
      folder: { id: "projekte", parentFolderId: null, name: "Projekte", sortOrder: 1, collapsed: false },
    }]);
    const result = service.applyOperations(withFolder, [{
      type: "createEntry",
      entry: { id: "entry-1", runtimeId: "00000000-0000-4000-8000-000000000001", name: "Build", parentFolderId: "projekte", sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null },
    }, {
      type: "updateEntry",
      id: "entry-1",
      patch: { parentFolderId: "default", pinned: true },
    }]);
    expect(result.entries[0]).toMatchObject({ parentFolderId: "default", pinned: true });
    expect(result.folders).toHaveLength(2);
  });

  it("verhindert Zyklen bei Ordner-Verschachtelung", () => {
    const withFolder = service.applyOperations(baseDocument(), [{
      type: "createFolder",
      folder: { id: "a", parentFolderId: null, name: "A", sortOrder: 1, collapsed: false },
    }]);
    const withSub = service.applyOperations(withFolder, [{
      type: "createFolder",
      folder: { id: "b", parentFolderId: "a", name: "B", sortOrder: 1, collapsed: false },
    }]);
    expect(() => service.applyOperations(withSub, [{
      type: "updateFolder",
      id: "a",
      patch: { parentFolderId: "b" },
    }])).toThrowError(/nicht in sich selbst/);
  });

  it("verschiebt Kinder beim Löschen eines Ordners statt sie zu verlieren", () => {
    const doc = service.applyOperations(baseDocument(), [
      { type: "createFolder", folder: { id: "projekte", parentFolderId: null, name: "Projekte", sortOrder: 1, collapsed: false } },
      { type: "createEntry", entry: { id: "entry-1", runtimeId: "00000000-0000-4000-8000-000000000001", name: "Build", parentFolderId: "projekte", sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null } },
    ]);
    const result = service.applyOperations(doc, [{ type: "deleteFolder", id: "projekte", moveChildrenTo: "default" }]);
    expect(result.folders.find((folder) => folder.id === "projekte")).toBeUndefined();
    expect(result.entries[0]).toMatchObject({ parentFolderId: "default" });
  });

  it("entfernt gelöschte Terminals aus dem Pane-Layout der betroffenen Fläche", () => {
    const doc: TerminalWorkspaceV2 = {
      version: 2,
      entries: [
        { id: "entry-1", runtimeId: "00000000-0000-4000-8000-000000000001", name: "A", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null },
        { id: "entry-2", runtimeId: "00000000-0000-4000-8000-000000000002", name: "B", parentFolderId: null, sortOrder: 1, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null },
      ],
      folders: [],
      areaLayouts: {
        standalone: {
          paneLayout: {
            type: "split",
            id: "split-1",
            orientation: "horizontal",
            sizes: [50, 50],
            children: [
              { type: "pane", id: "pane-1", runtimeId: "00000000-0000-4000-8000-000000000001" },
              { type: "pane", id: "pane-2", runtimeId: "00000000-0000-4000-8000-000000000002" },
            ],
          },
          focusedPaneId: "pane-2",
        },
      },
    };
    const result = service.applyOperations(doc, [{ type: "deleteEntry", id: "entry-1" }]);
    expect(result.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId: "00000000-0000-4000-8000-000000000002" });
    expect(result.areaLayouts.standalone!.focusedPaneId).toBe("pane-00000000-0000-4000-8000-000000000002");
  });

  it("wendet denselben Batch nach einer verlorenen Save-Antwort idempotent erneut an", () => {
    const entry = { id: "entry-1", runtimeId: "00000000-0000-4000-8000-000000000001", name: "Build", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell" as const, projectId: null, initialCwd: null };
    const folder = { id: "projekte", parentFolderId: null, name: "Projekte", sortOrder: 1, collapsed: false };
    const operations: Parameters<TerminalWorkspaceService["applyOperations"]>[1] = [
      { type: "createFolder", folder },
      { type: "createEntry", entry },
      { type: "setPaneLayout", areaId: "standalone", layout: { type: "pane", id: `pane-${entry.runtimeId}`, runtimeId: entry.runtimeId } },
      { type: "setFocusedPane", areaId: "standalone", paneId: `pane-${entry.runtimeId}` },
      { type: "updateEntry", id: entry.id, patch: { pinned: true } },
    ];

    const first = service.applyOperations(baseDocument(), operations);
    const repeated = service.applyOperations(first, operations);

    expect(repeated).toEqual(first);
    expect(repeated.folders.filter((candidate) => candidate.id === folder.id)).toHaveLength(1);
    expect(repeated.entries).toHaveLength(1);
  });

  it("behandelt bereits gelöschte Ziele als No-Op, aber abweichende IDs als Konflikt", () => {
    const entry = { id: "entry-1", runtimeId: null, name: "Build", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell" as const, projectId: null, initialCwd: null };
    const created = service.applyOperations(baseDocument(), [
      { type: "createEntry", entry },
      { type: "createFolder", folder: { id: "leer", parentFolderId: null, name: "Leer", sortOrder: 1, collapsed: false } },
    ]);
    const deleted = service.applyOperations(created, [
      { type: "deleteEntry", id: "entry-1" },
      { type: "deleteFolder", id: "leer", moveChildrenTo: null },
    ]);
    expect(service.applyOperations(deleted, [
      { type: "deleteEntry", id: "entry-1" },
      { type: "deleteFolder", id: "leer", moveChildrenTo: null },
    ])).toEqual(deleted);

    // Derselbe Eintrag mit anderem Namen ist nach einem späteren Update im
    // selben Batch weiterhin ein No-Op; eine fremde Runtime bleibt ein Konflikt.
    expect(service.applyOperations(created, [
      { type: "createEntry", entry: { ...entry, name: "Anders" } },
    ])).toEqual(created);
    expect(() => service.applyOperations(created, [
      { type: "createEntry", entry: { ...entry, runtimeId: "00000000-0000-4000-8000-000000000099" } },
    ])).toThrowError(/existiert bereits/);
    expect(service.applyOperations(created, [
      { type: "createFolder", folder: { id: "leer", parentFolderId: null, name: "Anders", sortOrder: 2, collapsed: false } },
    ])).toEqual(created);
  });

  it("lehnt Layouts mit unbekannten Runtimes ab", () => {
    const doc = service.applyOperations(baseDocument(), [{
      type: "createEntry",
      entry: { id: "entry-1", runtimeId: "00000000-0000-4000-8000-000000000001", name: "A", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null },
    }]);
    expect(() => service.applyOperations(doc, [{
      type: "setPaneLayout",
      areaId: "standalone",
      layout: { type: "pane", id: "pane-x", runtimeId: "00000000-0000-4000-8000-000000000099" },
    }])).toThrowError(AppError);
  });
});

describe("TerminalWorkspace V1→V2 Migration", () => {
  it("übernimmt Tabs als Entries in einen Standardordner und erhält Runtime-IDs", () => {
    const migrated = migrateTerminalWorkspaceV1({
      version: 1,
      areas: {
        standalone: {
          id: "standalone",
          tabs: [
            { id: "00000000-0000-4000-8000-000000000001", projectId: null, kind: "shell", initialCwd: null },
            { id: "00000000-0000-4000-8000-000000000002", projectId: "projekt-a", kind: "codex", initialCwd: null },
          ],
          activeTabId: "00000000-0000-4000-8000-000000000001",
          splitTabIds: null,
          splitSizes: [50, 50],
        },
      },
    });
    expect(migrated.version).toBe(2);
    expect(migrated.entries).toHaveLength(2);
    expect(migrated.entries[0]).toMatchObject({ runtimeId: "00000000-0000-4000-8000-000000000001", parentFolderId: "default" });
    expect(migrated.entries[1]).toMatchObject({ runtimeId: "00000000-0000-4000-8000-000000000002", kind: "codex" });
    expect(migrated.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane", runtimeId: "00000000-0000-4000-8000-000000000001" });
    expect(migrated.areaLayouts.standalone!.focusedPaneId).toBe("pane-00000000-0000-4000-8000-000000000001");
  });

  it("übernimmt bestehende Splits als Split-Layout", () => {
    const migrated = migrateTerminalWorkspaceV1({
      version: 1,
      areas: {
        standalone: {
          id: "standalone",
          tabs: [
            { id: "00000000-0000-4000-8000-000000000001", projectId: null, kind: "shell", initialCwd: null },
            { id: "00000000-0000-4000-8000-000000000002", projectId: null, kind: "shell", initialCwd: null },
          ],
          activeTabId: "00000000-0000-4000-8000-000000000002",
          splitTabIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
          splitSizes: [30, 70],
        },
      },
    });
    expect(migrated.areaLayouts.standalone!.paneLayout).toMatchObject({
      type: "split",
      sizes: [30, 70],
      children: [
        { runtimeId: "00000000-0000-4000-8000-000000000001" },
        { runtimeId: "00000000-0000-4000-8000-000000000002" },
      ],
    });
  });

  it("behandelt beschädigte Verweise fail safe", () => {
    const migrated = migrateTerminalWorkspaceV1({
      version: 1,
      areas: {
        standalone: {
          id: "standalone",
          tabs: [
            { id: "00000000-0000-4000-8000-000000000001", projectId: null, kind: "shell", initialCwd: null },
          ],
          activeTabId: "00000000-0000-4000-8000-000000000001",
          splitTabIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000099"],
          splitSizes: [50, 50],
        },
      },
    });
    // Der Split verweist auf eine unbekannte Runtime → fällt auf ein Pane zurück.
    expect(migrated.areaLayouts.standalone!.paneLayout).toMatchObject({ type: "pane" });
  });

  it("liefert ein leeres, gültiges V2-Dokument für neue Nutzer", () => {
    const empty = emptyTerminalWorkspaceV2();
    expect(empty.version).toBe(2);
    expect(empty.entries).toEqual([]);
    expect(empty.folders[0]).toMatchObject({ id: "default" });
    expect(empty.areaLayouts).toEqual({});
  });
});
