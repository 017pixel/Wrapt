// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import type { TerminalSession } from "@wrapt/contracts";
import { useTerminalWorkspaceStore } from "../../stores/terminalWorkspace";
import { TerminalSessionPicker } from "./terminal-session-picker";
import { terminalOrbitPayload, terminalStandalonePath, terminalStandalonePathForTool, useTerminalOrbitHandoff } from "./terminal-handoff";
import { OrbitNodeStandaloneAction } from "../orbit/OrbitNodeStandaloneAction";

const { requestOrbitNode } = vi.hoisted(() => ({ requestOrbitNode: vi.fn() }));
vi.mock("../../lib/orbitPalette", () => ({ requestOrbitNode }));

afterEach(cleanup);

const session: TerminalSession = {
  id: "00000000-0000-4000-8000-000000000011",
  runtimeId: "00000000-0000-4000-8000-000000000012",
  kind: "codex",
  mode: "agent",
  projectId: "projekt-a",
  cwd: "/projects/a",
  pid: 42,
  cols: 100,
  rows: 30,
  status: "running",
  createdAt: "2026-09-26T10:00:00.000Z",
  updatedAt: "2026-09-26T10:00:00.000Z",
  exitCode: null,
  exitSignal: null,
  supervisor: "tmux",
  managed: true,
  connectedClients: 1,
};

beforeEach(() => {
  requestOrbitNode.mockClear();
  useTerminalWorkspaceStore.setState({
    document: {
      version: 2,
      entries: [{ id: "entry-1", runtimeId: session.runtimeId, name: "Codex im Projekt", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "codex", projectId: session.projectId, initialCwd: session.cwd }],
      folders: [],
      areaLayouts: {},
    },
  });
});

it("händigt die vorhandene Runtime samt Projekt-ID und gespeichertem Namen an Orbit aus", () => {
  expect(terminalOrbitPayload(session, "Codex im Projekt")).toEqual({
    type: "tool",
    toolType: "codex",
    title: "Codex im Projekt",
    runtimeId: session.runtimeId,
    projectId: "projekt-a",
  });
});

it("bildet Shell, Claude und Codex auf passende Orbit-Werkzeuge ab und schließt OpenCode aus", () => {
  expect(terminalOrbitPayload({ ...session, kind: "shell" })?.toolType).toBe("terminal");
  expect(terminalOrbitPayload({ ...session, kind: "claude" })?.toolType).toBe("claude");
  expect(terminalOrbitPayload({ ...session, kind: "codex" })?.toolType).toBe("codex");
  expect(terminalOrbitPayload({ ...session, kind: "opencode" })).toBeNull();
});

it("bietet in der Session-Auswahl eine zugängliche Orbit-Aktion", () => {
  const openInOrbit = vi.fn();
  const view = render(<TerminalSessionPicker kind="codex" sessions={[session]} openTabIds={[]} orbitEnabled onOpen={vi.fn()} onOpenInOrbit={openInOrbit} onRestart={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(view.getByRole("button", { name: "Session im Orbit öffnen" }));
  expect(openInOrbit).toHaveBeenCalledWith(session);
});

it("zeigt für OpenCode keine Orbit-PTY-Aktion an", () => {
  const openCodeSession = { ...session, kind: "opencode" as const };
  const view = render(<TerminalSessionPicker kind="opencode" sessions={[openCodeSession]} openTabIds={[]} orbitEnabled onOpen={vi.fn()} onOpenInOrbit={vi.fn()} onRestart={vi.fn()} onClose={vi.fn()} />);
  expect(view.queryByRole("button", { name: "Session im Orbit öffnen" })).toBeNull();
});

it("zeigt bei deaktiviertem Orbit keine Orbit-Aktion an", () => {
  const view = render(<TerminalSessionPicker kind="codex" sessions={[session]} openTabIds={[]} orbitEnabled={false} onOpen={vi.fn()} onOpenInOrbit={vi.fn()} onRestart={vi.fn()} onClose={vi.fn()} />);
  expect(view.queryByRole("button", { name: "Session im Orbit öffnen" })).toBeNull();
});

it("queued den Orbit-Knoten vor dem Routenwechsel und übernimmt dieselbe Runtime-ID", () => {
  function Trigger() {
    const openInOrbit = useTerminalOrbitHandoff();
    const location = useLocation();
    return <><button onClick={() => openInOrbit(session)}>Im Orbit öffnen</button><output>{location.pathname}</output></>;
  }

  const view = render(<MemoryRouter initialEntries={["/terminal"]}><Routes><Route path="*" element={<Trigger />} /></Routes></MemoryRouter>);
  fireEvent.click(view.getByRole("button", { name: "Im Orbit öffnen" }));
  expect(requestOrbitNode).toHaveBeenCalledWith(terminalOrbitPayload(session, "Codex im Projekt"));
  expect(view.getByText("/orbit")).not.toBeNull();
});

it("führt Shell, Codex und Claude zur Sessionroute und OpenCode zur eigenständigen Web-Route", () => {
  expect(terminalStandalonePath(session.runtimeId, "shell")).toBe(`/terminal?session=${session.runtimeId}`);
  expect(terminalStandalonePath(session.runtimeId, "codex")).toBe(`/codex?session=${session.runtimeId}`);
  expect(terminalStandalonePath(session.runtimeId, "claude")).toBe(`/claude?session=${session.runtimeId}`);
  expect(terminalStandalonePath(session.runtimeId, "opencode")).toBeNull();
  expect(terminalStandalonePathForTool(session.runtimeId, "terminal")).toBe(`/terminal?session=${session.runtimeId}`);
  expect(terminalStandalonePathForTool(session.runtimeId, "codex")).toBe(`/codex?session=${session.runtimeId}`);
  expect(terminalStandalonePathForTool(session.runtimeId, "claude")).toBe(`/claude?session=${session.runtimeId}`);
  expect(terminalStandalonePathForTool(null, "opencode")).toBe("/opencode");
});

it("stellt für einen OpenCode-Knoten ohne Runtime eine zugängliche Standalone-Aktion bereit", () => {
  function Trigger() {
    const location = useLocation();
    const path = terminalStandalonePathForTool(null, "opencode");
    return <>{path ? <OrbitNodeStandaloneAction path={path} /> : null}<output>{location.pathname}</output></>;
  }

  const view = render(<MemoryRouter initialEntries={["/orbit"]}><Routes><Route path="*" element={<Trigger />} /></Routes></MemoryRouter>);
  fireEvent.click(view.getByRole("button", { name: "Werkzeug eigenständig öffnen" }));
  expect(view.getByText("/opencode")).not.toBeNull();
});
