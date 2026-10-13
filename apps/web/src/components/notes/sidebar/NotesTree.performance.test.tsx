// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { NoteSummary } from "@wrapt/contracts";
import { NotesTree } from "./NotesTree";
import { NotesDragProvider } from "./NotesDragContext";
import { NotesCollapse } from "./NotesCollapse";
import { useNotesPreferences } from "../../../stores/notesPreferences";
import { buildSidebarIndex } from "./sidebarIndex";

afterEach(() => { cleanup(); vi.useRealTimers(); });
function seed() {
  return Array.from({ length: 1_000 }, (_, index) => ({
    id: String(index), title: `Seite ${index}`, parentId: index < 100 ? null : String(index % 100),
    folderId: index < 100 ? `ordner-${index % 10}` : null, sortOrder: index,
    archived: false, updatedAt: "2026-01-01", icon: null,
  } as NoteSummary));
}
const callbacks = { onSelect: vi.fn(), onCreateSubpage: vi.fn(), onPatch: vi.fn(), onMove: vi.fn(),
  onOpenMenu: vi.fn(), onRenameRequestHandled: vi.fn() };

it("mountet bei 1.000 Seiten nur die 100 geschlossenen Wurzeln und öffnet aktive Vorfahren", { timeout: 20_000 }, () => {
  useNotesPreferences.setState({ expanded: {} });
  const notes = seed();
  const view = render(<NotesDragProvider><NotesTree notes={notes} activeId={null} renameRequestId={null} {...callbacks} /></NotesDragProvider>);
  expect(view.container.querySelectorAll(".notes-tree-row")).toHaveLength(100);
  fireEvent.click(view.getAllByRole("button", { name: "Ausklappen" })[0]!);
  expect(view.container.querySelectorAll(".notes-tree-row")).toHaveLength(109);
  view.rerender(<NotesDragProvider><NotesTree notes={notes} activeId="101" renameRequestId={null} {...callbacks} /></NotesDragProvider>);
  expect(view.getByRole("button", { name: "Seite 101" })).toBeTruthy();
  expect(useNotesPreferences.getState().expanded["1"]).toBe(true);
});

it("behält Kinder bis zum Animationsende, verwirft den alten Timer bei erneutem Öffnen", async () => {
  vi.useFakeTimers();
  const view = render(<NotesCollapse collapsed={false}><button>Kind</button></NotesCollapse>);
  view.rerender(<NotesCollapse collapsed><button>Kind</button></NotesCollapse>);
  expect(view.queryByText("Kind")).toBeTruthy();
  view.rerender(<NotesCollapse collapsed={false}><button>Kind</button></NotesCollapse>);
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(view.queryByText("Kind")).toBeTruthy();
  view.rerender(<NotesCollapse collapsed><button>Kind</button></NotesCollapse>);
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(view.queryByText("Kind")).toBeNull();
});

it("teilt geerbte Ordner einmal und behält Waisen und Kreise endlich", () => {
  const notes = seed();
  const index = buildSidebarIndex(notes);
  expect(index.byId.size).toBe(1_000);
  expect(index.byFolder.get("ordner-0")).toHaveLength(100);
  expect(index.byFolder.get("ordner-1")?.find((note) => note.id === "101")).toBeTruthy();
  const cycle = [{ ...notes[0]!, parentId: "1" }, { ...notes[1]!, parentId: "0" }];
  expect(buildSidebarIndex(cycle).active).toHaveLength(2);
});
