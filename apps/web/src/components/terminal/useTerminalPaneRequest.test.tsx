// @vitest-environment jsdom
import { StrictMode, type ReactNode } from "react";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { TerminalSession, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";
import { createEntry } from "./workspace/terminalWorkspaceModel";
import { useTerminalPaneRequest } from "./useTerminalPaneRequest";

const runtimeId = "00000000-0000-4000-8000-000000000001";
const areaId = `orbit-${runtimeId}`;
const session: TerminalSession = {
  id: "00000000-0000-4000-8000-000000000002", runtimeId, kind: "codex", mode: "agent",
  projectId: "projekt-a", cwd: "/projects/a", pid: 42, cols: 100, rows: 30, status: "running",
  createdAt: "2026-09-26T10:00:00.000Z", updatedAt: "2026-09-26T10:00:00.000Z",
  exitCode: null, exitSignal: null, supervisor: "tmux", managed: true, connectedClients: 1,
};

const defaults = {
  areaId, active: true, requestedSessionId: null, requestedRuntimeId: runtimeId,
  kind: "shell" as const, initialProjectId: "projekt-a", sessions: [] as readonly TerminalSession[],
};

type RequestOptions = Omit<Parameters<typeof useTerminalPaneRequest>[0], "document">;

function useRequest(options: RequestOptions) {
  const document = useTerminalWorkspaceStore((state) => state.document);
  useTerminalPaneRequest({ ...options, document });
}

beforeEach(() => {
  const document: TerminalWorkspaceV2 = {
    version: 2, entries: [],
    folders: [{ id: "default", parentFolderId: null, name: "Terminal", sortOrder: 0, collapsed: false }],
    areaLayouts: {},
  };
  useTerminalWorkspaceStore.setState({ document, pendingOps: [], dirty: false });
});

afterEach(cleanup);

it("legt einen frischen Orbit-Pane mit der vorgegebenen Runtime genau einmal an", () => {
  const view = renderHook(useRequest, {
    initialProps: defaults,
    wrapper: ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>,
  });
  view.rerender({ ...defaults });
  const state = useTerminalWorkspaceStore.getState();
  expect(state.document?.entries).toEqual([expect.objectContaining({
    runtimeId, kind: "shell", projectId: "projekt-a", name: "Terminal 1",
  })]);
  expect(state.document?.areaLayouts[areaId]).toEqual({
    paneLayout: { type: "pane", id: `pane-${runtimeId}`, runtimeId }, focusedPaneId: `pane-${runtimeId}`,
  });
  expect(state.pendingOps.filter((operation) => operation.type === "createEntry")).toHaveLength(1);
});

it("übernimmt bei einer vorhandenen Orbit-Runtime die Server-Metadaten", () => {
  renderHook(useRequest, { initialProps: { ...defaults, sessions: [session] } });
  expect(useTerminalWorkspaceStore.getState().document?.entries).toEqual([expect.objectContaining({
    runtimeId, kind: "codex", projectId: "projekt-a", initialCwd: "/projects/a", name: "Codex 1",
  })]);
});

it("öffnet eine gespeicherte Runtime auch ohne laufende Session und bewahrt ihre Einstellungen", () => {
  const entry = createEntry({ runtimeId, kind: "shell", name: "Mein Terminal", pinned: true, persistent: true });
  const state = useTerminalWorkspaceStore.getState();
  useTerminalWorkspaceStore.setState({ document: { ...state.document!, entries: [entry] } });
  renderHook(useRequest, { initialProps: defaults });
  const next = useTerminalWorkspaceStore.getState();
  expect(next.document?.entries).toEqual([entry]);
  expect(next.document?.areaLayouts[areaId]?.paneLayout).toMatchObject({ type: "pane", runtimeId });
  expect(next.pendingOps.some((operation) => operation.type === "createEntry")).toBe(false);
});

it.each([session.id, session.runtimeId])("öffnet den bestehenden Session-Deeplink %s ohne eine zweite Runtime", (requestedSessionId) => {
  renderHook(useRequest, {
    initialProps: { ...defaults, requestedRuntimeId: null, requestedSessionId, sessions: [session] },
  });
  expect(useTerminalWorkspaceStore.getState().document?.entries).toEqual([expect.objectContaining({ runtimeId: session.runtimeId })]);
});

it("legt für einen unbekannten Session-Deeplink keine Runtime an", () => {
  renderHook(useRequest, {
    initialProps: { ...defaults, requestedRuntimeId: null, requestedSessionId: "unbekannte-session" },
  });
  const state = useTerminalWorkspaceStore.getState();
  expect(state.document?.entries).toEqual([]);
  expect(state.document?.areaLayouts).toEqual({});
  expect(state.pendingOps).toEqual([]);
});

it("wartet mit der Runtime-Anlage auf aktive Route und geladene Sessions", () => {
  const view = renderHook(useRequest, {
    initialProps: { ...defaults, active: false, sessions: undefined } as RequestOptions,
  });
  view.rerender({ ...defaults, sessions: undefined });
  expect(useTerminalWorkspaceStore.getState().document?.entries).toEqual([]);
  view.rerender(defaults);
  expect(useTerminalWorkspaceStore.getState().document?.entries).toHaveLength(1);
});
