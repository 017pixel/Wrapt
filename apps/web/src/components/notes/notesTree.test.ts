import { describe, expect, it } from "vitest";
import type { NoteSummary } from "@wrapt/contracts";
import { collectDescendantIds } from "./notesTree.js";
import { buildSidebarTree } from "./sidebar/sidebarTree.js";
import { resolveNotesDrop, resolveMoveToParent, sortChildNotes } from "./sidebar/treeDrop.js";

function summary(id: string, overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    id,
    title: id,
    icon: null,
    parentId: null,
    sortOrder: 0,
    favorite: false,
    archived: false,
    excerpt: "",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("notesTree", () => {
  it("sammelt Nachfahren für den Papierkorb", () => {
    const notes = [
      summary("eltern"),
      summary("kind", { parentId: "eltern" }),
      summary("enkel", { parentId: "kind" }),
      summary("fremd"),
    ];
    expect(collectDescendantIds(notes, "eltern").sort()).toEqual(["enkel", "kind"]);
    expect(collectDescendantIds(notes, "fremd")).toEqual([]);
  });
});

describe("buildSidebarTree", () => {
  it("verschachtelt Kinder und sortiert nach sortOrder", () => {
    const tree = buildSidebarTree([
      summary("kind", { parentId: "eltern" }),
      summary("eltern", { sortOrder: 2 }),
      summary("erste", { sortOrder: 1 }),
    ]);
    expect(tree.map((node) => node.note.id)).toEqual(["erste", "eltern"]);
    expect(tree[1]?.children.map((node) => node.note.id)).toEqual(["kind"]);
  });

  it("blendet archivierte Seiten aus und behandelt Waisen als Wurzel", () => {
    const tree = buildSidebarTree([
      summary("waise", { parentId: "fehlt" }),
      summary("archiviert", { archived: true }),
      summary("normal"),
    ]);
    expect(tree.map((node) => node.note.id).sort()).toEqual(["normal", "waise"]);
  });

  it("schneidet Kreise ab, ohne Seiten zu verlieren", () => {
    const tree = buildSidebarTree([
      summary("a", { parentId: "b" }),
      summary("b", { parentId: "a" }),
    ]);
    const ids = new Set<string>();
    const walk = (nodes: ReturnType<typeof buildSidebarTree>) => {
      for (const node of nodes) {
        expect(ids.has(node.note.id)).toBe(false);
        ids.add(node.note.id);
        walk(node.children);
      }
    };
    walk(tree);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});

describe("sortChildNotes", () => {
  it("sortiert nach sortOrder, dann nach Aktualität", () => {
    const sorted = sortChildNotes([
      summary("alt", { sortOrder: 1, updatedAt: "2026-09-01T10:00:00.000Z" }),
      summary("neu", { sortOrder: 1, updatedAt: "2026-09-20T10:00:00.000Z" }),
      summary("zuerst", { sortOrder: 0 }),
    ]);
    expect(sorted.map((note) => note.id)).toEqual(["zuerst", "neu", "alt"]);
  });
});

describe("resolveNotesDrop", () => {
  const notes = [
    summary("eltern"),
    summary("kind", { parentId: "eltern", sortOrder: 0 }),
    summary("gruppe"),
    summary("a", { parentId: "gruppe", sortOrder: 0 }),
    summary("b", { parentId: "gruppe", sortOrder: 1 }),
    summary("c", { parentId: "gruppe", sortOrder: 2 }),
  ];

  it("legt eine Seite als Kind ab", () => {
    const result = resolveNotesDrop(notes, "a", "eltern", "inside");
    expect(result).toEqual({ parentId: "eltern", sortOrder: 1 });
  });

  it("ordnet zwischen Geschwistern ein", () => {
    expect(resolveNotesDrop(notes, "a", "b", "after")).toMatchObject({
      parentId: "gruppe",
      sortOrder: 1.5,
    });
    expect(resolveNotesDrop(notes, "c", "b", "before")).toMatchObject({
      parentId: "gruppe",
      sortOrder: 0.5,
    });
  });

  it("hängt am Rand an", () => {
    expect(resolveNotesDrop(notes, "a", "b", "before")).toMatchObject({
      parentId: "gruppe",
      sortOrder: 0.5,
    });
    expect(resolveNotesDrop(notes, "a", "c", "after")).toMatchObject({
      parentId: "gruppe",
      sortOrder: 2.5,
    });
  });

  it("verhindert Kreise und Selbst-Drops", () => {
    expect(resolveNotesDrop(notes, "eltern", "eltern", "inside")).toBeNull();
    expect(resolveNotesDrop(notes, "eltern", "kind", "inside")).toBeNull();
    expect(resolveNotesDrop(notes, "kind", "eltern", "before")).not.toBeNull();
  });
});

describe("resolveMoveToParent", () => {
  const notes = [
    summary("eltern"),
    summary("kind", { parentId: "eltern", sortOrder: 0 }),
    summary("enkel", { parentId: "kind", sortOrder: 0 }),
    summary("gruppe"),
    summary("a", { parentId: "gruppe", sortOrder: 0 }),
    summary("b", { parentId: "gruppe", sortOrder: 1 }),
  ];

  it("hängt ans Ende der Zielkinder", () => {
    expect(resolveMoveToParent(notes, "a", "eltern")).toEqual({ parentId: "eltern", sortOrder: 1 });
    expect(resolveMoveToParent(notes, "a", null)).toEqual({ parentId: null, sortOrder: 1 });
  });

  it("verhindert Selbst- und Nachfahren-Ziele", () => {
    expect(resolveMoveToParent(notes, "eltern", "eltern")).toBeNull();
    expect(resolveMoveToParent(notes, "eltern", "kind")).toBeNull();
    expect(resolveMoveToParent(notes, "eltern", "enkel")).toBeNull();
    expect(resolveMoveToParent(notes, "eltern", null)).not.toBeNull();
  });

  it("lehnt unbekannte und archivierte Ziele ab", () => {
    expect(resolveMoveToParent(notes, "a", "fehlt")).toBeNull();
    expect(resolveMoveToParent([...notes, summary("weg", { archived: true })], "a", "weg")).toBeNull();
  });
});
