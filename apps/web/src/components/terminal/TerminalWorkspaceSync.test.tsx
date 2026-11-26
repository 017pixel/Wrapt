// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { terminalWorkspaceOpsRequestSchema, type TerminalWorkspaceOperation, type TerminalWorkspaceV2 } from "@wrapt/contracts";
import { ApiClientError, apiClient } from "../../lib/apiClient";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";
import { applyWorkspaceOperations } from "./workspace/terminalWorkspaceModel";
import { TerminalWorkspaceSync } from "./TerminalWorkspaceSync";

const empty = (): TerminalWorkspaceV2 => ({ version: 2, entries: [], folders: [], areaLayouts: {} });
const operations = (count: number): TerminalWorkspaceOperation[] => Array.from({ length: count }, (_, i) => ({
  type: "createFolder", folder: { id: `folder-${i}`, parentFolderId: null, name: `Ordner ${i}`, sortOrder: i, collapsed: false },
}));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.stubGlobal("BroadcastChannel", class { onmessage = null; postMessage() {} close() {} });
  useTerminalWorkspaceStore.setState({ document: null, revision: 0, hydrated: false, dirty: false, saving: false, syncError: null, syncKick: 0, pendingOps: [] });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it.each([false, true])("überträgt 120 Operationen geordnet in gültigen Batches, Konflikt=%s", async (conflict) => {
  let remote = empty();
  let revision = 0;
  let conflictPending = conflict;
  vi.spyOn(apiClient, "terminalWorkspace").mockImplementation(async () => ({ document: remote, revision, updatedAt: "2026-10-12T00:00:00Z" }));
  const committed: TerminalWorkspaceOperation[] = [];
  const save = vi.spyOn(apiClient, "terminalWorkspaceOps").mockImplementation(async (request) => {
    terminalWorkspaceOpsRequestSchema.parse(request);
    if (conflictPending) {
      conflictPending = false;
      revision += 1;
      throw new ApiClientError(409, "TERMINAL_WORKSPACE_CONFLICT", "Parallel geändert.");
    }
    expect(request.expectedRevision).toBe(revision);
    committed.push(...request.operations);
    remote = applyWorkspaceOperations(remote, request.operations);
    revision += 1;
    return { document: remote, revision, updatedAt: "2026-10-12T00:00:00Z" };
  });
  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  const pending = operations(120);
  act(() => useTerminalWorkspaceStore.getState().queueOps(pending));
  await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
  expect(committed).toEqual(pending);
  expect(save.mock.calls.map(([request]) => request.operations.length)).toEqual(conflict ? [50, 50, 50, 20] : [50, 50, 20]);
  expect(useTerminalWorkspaceStore.getState()).toMatchObject({ dirty: false, pendingOps: [], revision });
  expect(remote.folders).toHaveLength(120);
  expect(localStorage.getItem("wrapt.terminals.pending.v2")).toBeNull();
});

it("wiederholt fehlgeschlagene Saves mit Backoff statt in einer engen Schleife", async () => {
  let remote = empty();
  let revision = 0;
  let fail = true;
  vi.spyOn(apiClient, "terminalWorkspace").mockImplementation(async () => ({ document: remote, revision, updatedAt: "2026-10-12T00:00:00Z" }));
  const save = vi.spyOn(apiClient, "terminalWorkspaceOps").mockImplementation(async (request) => {
    if (fail) throw new ApiClientError(500, "INTERNAL_ERROR", "Server nicht erreichbar.");
    remote = applyWorkspaceOperations(remote, request.operations);
    return { document: remote, revision: ++revision, updatedAt: "2026-10-12T00:00:00Z" };
  });
  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  act(() => useTerminalWorkspaceStore.getState().queueOps(operations(1)));
  for (let index = 0; index < 4; index += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  }
  expect(save.mock.calls.length).toBeGreaterThan(1);
  expect(save.mock.calls.length).toBeLessThanOrEqual(5);
  expect(useTerminalWorkspaceStore.getState().pendingOps).toHaveLength(1);
  expect(useTerminalWorkspaceStore.getState().syncError).toContain("Neuer Versuch");
  fail = false;
  act(() => useTerminalWorkspaceStore.getState().kickSync());
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
  expect(useTerminalWorkspaceStore.getState()).toMatchObject({ dirty: false, pendingOps: [], syncError: null });
});

it("stoppt automatische Versuche nach fünf Fehlschlägen", async () => {
  const save = vi.spyOn(apiClient, "terminalWorkspaceOps").mockRejectedValue(new ApiClientError(500, "INTERNAL_ERROR", "Server nicht erreichbar."));
  vi.spyOn(apiClient, "terminalWorkspace").mockResolvedValue({ document: empty(), revision: 0, updatedAt: "2026-10-12T00:00:00Z" });
  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  act(() => useTerminalWorkspaceStore.getState().queueOps(operations(1)));
  for (let index = 0; index < 12; index += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  }
  expect(save.mock.calls.length).toBe(6);
  expect(useTerminalWorkspaceStore.getState().syncError).toContain("Automatische Versuche gestoppt");
  expect(useTerminalWorkspaceStore.getState().pendingOps).toHaveLength(1);
});
it("beendet den Speicherzustand sichtbar, wenn der Server keine Antwort liefert", async () => {
  vi.spyOn(apiClient, "terminalWorkspace").mockResolvedValue({ document: empty(), revision: 0, updatedAt: "2026-10-12T00:00:00Z" });
  const save = vi.spyOn(apiClient, "terminalWorkspaceOps").mockResolvedValue(undefined);
  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  act(() => useTerminalWorkspaceStore.getState().queueOps(operations(1)));
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });

  expect(save).toHaveBeenCalledTimes(1);
  expect(useTerminalWorkspaceStore.getState()).toMatchObject({ saving: false, dirty: true });
  expect(useTerminalWorkspaceStore.getState().syncError).toContain("Neuer Versuch");
  expect(useTerminalWorkspaceStore.getState().pendingOps).toHaveLength(1);
});

it("hält den blockierten Speicherfehler nach neuen Operationen sichtbar", async () => {
  vi.spyOn(apiClient, "terminalWorkspace").mockResolvedValue({ document: empty(), revision: 0, updatedAt: "2026-10-12T00:00:00Z" });
  vi.spyOn(apiClient, "terminalWorkspaceOps").mockRejectedValue(new ApiClientError(500, "INTERNAL_ERROR", "Server nicht erreichbar."));
  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  act(() => useTerminalWorkspaceStore.getState().queueOps(operations(1)));
  for (let index = 0; index < 12; index += 1) {
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  }
  expect(useTerminalWorkspaceStore.getState().syncError).toContain("Automatische Versuche gestoppt");

  const extra: TerminalWorkspaceOperation = {
    type: "createFolder",
    folder: { id: "folder-extra", parentFolderId: null, name: "Extra", sortOrder: 9, collapsed: false },
  };
  act(() => useTerminalWorkspaceStore.getState().queueOps([extra]));

  expect(useTerminalWorkspaceStore.getState().pendingOps).toHaveLength(2);
  expect(useTerminalWorkspaceStore.getState().saving).toBe(false);
  expect(useTerminalWorkspaceStore.getState().syncError).toContain("Automatische Versuche gestoppt");
});

it("behält den unbestätigten Rest und während eines Saves ergänzte Operationen", async () => {
  let remote = empty();
  let revision = 0;
  let complete!: () => void;
  vi.spyOn(apiClient, "terminalWorkspace").mockImplementation(async () => ({ document: remote, revision, updatedAt: "2026-10-12T00:00:00Z" }));
  const save = vi.spyOn(apiClient, "terminalWorkspaceOps").mockImplementation(async (request) => {
    if (revision === 0) await new Promise<void>((resolve) => { complete = resolve; });
    remote = applyWorkspaceOperations(remote, request.operations);
    return { document: remote, revision: ++revision, updatedAt: "2026-10-12T00:00:00Z" };
  });
  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  const pending = operations(121);
  act(() => useTerminalWorkspaceStore.getState().queueOps(pending.slice(0, 120)));
  await act(async () => { await vi.advanceTimersByTimeAsync(401); });
  act(() => useTerminalWorkspaceStore.getState().queueOps(pending.slice(120)));
  expect(useTerminalWorkspaceStore.getState().pendingOps).toHaveLength(121);
  // Der Recovery-Puffer wird synchron fortgeschrieben und enthält deshalb
  // bereits die während des laufenden Saves ergänzte Operation.
  expect(JSON.parse(localStorage.getItem("wrapt.terminals.pending.v2")!).operations).toHaveLength(121);
  await act(async () => { complete(); await vi.advanceTimersByTimeAsync(2_000); });
  expect(save.mock.calls.map(([request]) => request.operations.length)).toEqual([50, 50, 21]);
  expect(remote.folders.map(folder => folder.id)).toEqual(pending.map(op => op.type === "createFolder" ? op.folder.id : null));
  expect(useTerminalWorkspaceStore.getState().pendingOps).toEqual([]);
});

it("validiert Offline-Ops beim Laden und legt beschädigte getrennt ab", async () => {
  const valid: TerminalWorkspaceOperation = {
    type: "createFolder",
    folder: { id: "offline", parentFolderId: null, name: "Offline", sortOrder: 1, collapsed: false },
  };
  const invalid = { type: "createFolder", folder: { id: "kaputt", name: "Unvollständig" } };
  localStorage.setItem("wrapt.terminals.pending.v2", JSON.stringify({ revision: 4, operations: [valid, invalid] }));
  vi.spyOn(apiClient, "terminalWorkspace").mockResolvedValue({ document: empty(), revision: 2, updatedAt: "2026-10-12T00:00:00Z" });
  let revision = 2;
  const save = vi.spyOn(apiClient, "terminalWorkspaceOps").mockImplementation(async (request) => {
    return { document: applyWorkspaceOperations(empty(), request.operations), revision: ++revision, updatedAt: "2026-10-12T00:00:00Z" };
  });

  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });

  const state = useTerminalWorkspaceStore.getState();
  expect(state.hydrated).toBe(true);
  expect(state.pendingOps).toEqual([valid]);
  expect(state.document!.folders.some((folder) => folder.id === "offline")).toBe(true);
  expect(state.document!.folders.some((folder) => folder.id === "kaputt")).toBe(false);
  const quarantine = JSON.parse(localStorage.getItem("wrapt.terminals.pending.v2.quarantine")!);
  expect(quarantine.entries).toEqual([invalid]);
  expect(save).not.toHaveBeenCalled();
});

it("persistiert neue Operationen sofort statt erst beim Debounce-Save", async () => {
  vi.spyOn(apiClient, "terminalWorkspace").mockResolvedValue({ document: empty(), revision: 0, updatedAt: "2026-10-12T00:00:00Z" });
  vi.spyOn(apiClient, "terminalWorkspaceOps").mockImplementation(async (request) => ({
    document: applyWorkspaceOperations(empty(), request.operations),
    revision: 1,
    updatedAt: "2026-10-12T00:00:00Z",
  }));

  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  act(() => useTerminalWorkspaceStore.getState().queueOps(operations(2)));

  // Noch kein Timer-Lauf: Der Puffer muss bereits geschrieben sein.
  expect(JSON.parse(localStorage.getItem("wrapt.terminals.pending.v2")!).operations).toHaveLength(2);
});

it("lädt das Workspace-Dokument nach einem manuellen Kick erneut", async () => {
  const load = vi.spyOn(apiClient, "terminalWorkspace")
    .mockRejectedValueOnce(new ApiClientError(500, "INTERNAL_ERROR", "Server nicht erreichbar."))
    .mockResolvedValue({ document: empty(), revision: 7, updatedAt: "2026-10-12T00:00:00Z" });

  render(<TerminalWorkspaceSync />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(load).toHaveBeenCalledTimes(1);
  expect(useTerminalWorkspaceStore.getState().hydrated).toBe(false);
  expect(useTerminalWorkspaceStore.getState().syncError).toContain("Neuer Versuch");

  act(() => useTerminalWorkspaceStore.getState().kickSync());
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });

  expect(load).toHaveBeenCalledTimes(2);
  expect(useTerminalWorkspaceStore.getState().hydrated).toBe(true);
  expect(useTerminalWorkspaceStore.getState().revision).toBe(7);
});
