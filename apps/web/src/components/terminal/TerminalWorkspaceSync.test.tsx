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
  useTerminalWorkspaceStore.setState({ document: null, revision: 0, hydrated: false, dirty: false, saving: false, syncError: null, pendingOps: [] });
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
  expect(JSON.parse(localStorage.getItem("wrapt.terminals.pending.v2")!).operations).toHaveLength(120);
  await act(async () => { complete(); await vi.advanceTimersByTimeAsync(2_000); });
  expect(save.mock.calls.map(([request]) => request.operations.length)).toEqual([50, 50, 21]);
  expect(remote.folders.map(folder => folder.id)).toEqual(pending.map(op => op.type === "createFolder" ? op.folder.id : null));
  expect(useTerminalWorkspaceStore.getState().pendingOps).toEqual([]);
});
