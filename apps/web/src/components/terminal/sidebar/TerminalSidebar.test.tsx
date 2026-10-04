// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TerminalSession, TerminalWorkspaceV2 } from "@wrapt/contracts";
import { apiClient } from "../../../lib/apiClient";
import { useTerminalWorkspaceStore } from "../../../stores/terminalWorkspace";
import { TerminalSidebar } from "./TerminalSidebar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { defaultContextMenuConfig } from "@wrapt/contracts";
import { ContextMenuProvider } from "../../context-menu/ContextMenuProvider";
import { registerHostContextMenus } from "../../../extensions/hostContextMenus";

// Die Sidebar-Aktionen brauchen keinen Canvas-Renderer für Hover-Vorschauen.
vi.mock("../useTerminalPreview", () => ({
  useTerminalPreview: () => ({ lines: [], mountRef: { current: null }, status: "ready" }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useTerminalWorkspaceStore.setState({ document: null, pendingOps: [], dirty: false });
});

function workspace(): TerminalWorkspaceV2 {
  return {
    version: 2,
    entries: [{ id: "entry-shell", runtimeId: "runtime-shell", name: "Shell", parentFolderId: null, sortOrder: 0, pinned: false, persistent: false, kind: "shell", projectId: null, initialCwd: null }],
    folders: [],
    areaLayouts: {},
  };
}

function renderSidebar(value = workspace(), sessions: TerminalSession[] = []) {
  const callbacks = {
    onToggleSidebar: vi.fn(),
    onNewTerminal: vi.fn(),
    onNewTerminalInFolder: vi.fn(),
    onOpenEntry: vi.fn(),
    onOpenInSplit: vi.fn(),
    onResync: vi.fn(),
    onRestart: vi.fn(),
    onClose: vi.fn(),
    onCreateSplit: vi.fn(),
    onClearSplit: vi.fn(),
    onClear: vi.fn(),
    onClosePane: vi.fn(),
    onHoverStart: vi.fn(),
    onHoverEnd: vi.fn(),
  };
  useTerminalWorkspaceStore.getState().replaceRemote(value, 0);
  registerHostContextMenus();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["system", "context-menu"], { contextMenu: defaultContextMenuConfig });
  render(
    <QueryClientProvider client={client}><MemoryRouter><ContextMenuProvider><TerminalSidebar
      areaId="standalone"
      kind="shell"
      meta={{}}
      sessions={sessions}
      cwds={{}}
      isMobile={false}
      open
      activeRuntimeId={null}
      hasSplit={false}
      hasActivePane={false}
      sessionPicker={<span>Sessions</span>}
      {...callbacks}
    /></ContextMenuProvider></MemoryRouter></QueryClientProvider>,
  );
  return callbacks;
}

describe("TerminalSidebar", () => {
  it("behält den Editorfokus beim Erstellen eines Unterordners aus dem Menü", async () => {
    const value = workspace();
    value.folders = [{ id: "root", parentFolderId: null, name: "Agenten", sortOrder: 0, collapsed: false }];
    renderSidebar(value);
    const actions = screen.getByRole("button", { name: "Aktionen für Agenten" });
    actions.focus();
    fireEvent.click(actions);
    fireEvent.click(screen.getByRole("menuitem", { name: "Neuer Unterordner" }));
    await new Promise((resolve) => window.setTimeout(resolve, 20));
    const input = screen.getByDisplayValue("Neuer Ordner");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "Tests" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useTerminalWorkspaceStore.getState().document?.folders.find((folder) => folder.name === "Tests")?.parentFolderId).toBe("root");
  });
  it("lässt einen neuen Ordner direkt benennen", () => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Neuer Ordner" }));
    const input = screen.getByDisplayValue("Neuer Ordner");
    fireEvent.change(input, { target: { value: "Agenten" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useTerminalWorkspaceStore.getState().document?.folders[0]?.name).toBe("Agenten");
  });

  it("klappt auch Root-Ordner mit der Sammelaktion zu und wieder auf", () => {
    const value = workspace();
    value.folders = [{ id: "root", parentFolderId: null, name: "Agenten", sortOrder: 0, collapsed: false }, { id: "child", parentFolderId: "root", name: "Build", sortOrder: 0, collapsed: false }];
    renderSidebar(value);
    fireEvent.click(screen.getByRole("button", { name: "Weitere Terminalaktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Alle Ordner zuklappen" }));
    expect(useTerminalWorkspaceStore.getState().document?.folders.every((folder) => folder.collapsed)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Weitere Terminalaktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Alle Ordner aufklappen" }));
    expect(useTerminalWorkspaceStore.getState().document?.folders.every((folder) => !folder.collapsed)).toBe(true);
  });

  it("öffnet Terminalaktionen per sichtbarem Button und das Terminal per Tastatur", () => {
    const callbacks = renderSidebar();
    fireEvent.keyDown(screen.getByRole("button", { name: "Shell" }), { key: "Enter" });
    expect(callbacks.onOpenEntry).toHaveBeenCalledWith("runtime-shell");
    fireEvent.click(screen.getByRole("button", { name: "Aktionen für Shell" }));
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Persistent machen" }));
    expect(useTerminalWorkspaceStore.getState().document?.entries[0]?.persistent).toBe(true);
  });

  it("verbindet Titel und Pfeil zu einem funktionierenden Sidebar-Schalter", () => {
    const callbacks = renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: "Terminal-Sidebar ausblenden" }));
    expect(callbacks.onToggleSidebar).toHaveBeenCalledOnce();
  });

  it("öffnet per Rechtsklick auf freie Sidebar-Fläche das Kontextmenü", () => {
    const callbacks = renderSidebar();
    fireEvent.contextMenu(screen.getByRole("complementary", { name: "Terminal-Sidebar" }), { clientX: 40, clientY: 60 });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Neues Terminal" }));
    expect(callbacks.onNewTerminal).toHaveBeenCalledOnce();
  });

  it("benennt ein Terminal über Rechtsklick und Umbenennen um", () => {
    renderSidebar();
    fireEvent.contextMenu(screen.getByText("Shell"), { clientX: 40, clientY: 60 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Umbenennen" }));
    const input = screen.getByDisplayValue("Shell");
    fireEvent.change(input, { target: { value: "Backend" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useTerminalWorkspaceStore.getState().document?.entries[0]?.name).toBe("Backend");
  });

  it("schließt über die freie Fläche nur normale Terminals", async () => {
    const value = workspace();
    value.entries.push(
      { id: "entry-pinned", runtimeId: "runtime-pinned", name: "Gepinnt", parentFolderId: null, sortOrder: 1, pinned: true, persistent: false, kind: "shell", projectId: null, initialCwd: null },
      { id: "entry-persistent", runtimeId: "runtime-persistent", name: "Persistent", parentFolderId: null, sortOrder: 2, pinned: false, persistent: true, kind: "shell", projectId: null, initialCwd: null },
    );
    renderSidebar(value);
    fireEvent.contextMenu(screen.getByRole("complementary", { name: "Terminal-Sidebar" }), { clientX: 40, clientY: 60 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Alle normalen Terminals schließen" }));
    expect(screen.getByRole("dialog").textContent).toContain("1 normale Terminals");
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(useTerminalWorkspaceStore.getState().document?.entries.map((entry) => entry.name)).toEqual(["Gepinnt", "Persistent"]));
  });

  it("zeigt fehlgeschlagene Schließungen dauerhaft an und entfernt den Fehler nach erfolgreichem Wiederholen", async () => {
    const close = vi.spyOn(apiClient, "closeTerminalSession")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(null);
    const session: TerminalSession = {
      id: "session-shell", runtimeId: "runtime-shell", kind: "shell", mode: "agent",
      projectId: null, cwd: "/tmp", pid: 1, cols: 80, rows: 24, status: "running",
      createdAt: "2026-10-02T12:00:00Z", updatedAt: "2026-10-02T12:00:00Z",
      exitCode: null, exitSignal: null, supervisor: "direct", managed: false, connectedClients: 0,
    };
    renderSidebar(workspace(), [session]);
    const requestClose = () => {
      fireEvent.contextMenu(screen.getByRole("complementary", { name: "Terminal-Sidebar" }), { clientX: 40, clientY: 60 });
      fireEvent.click(screen.getByRole("menuitem", { name: "Alle normalen Terminals schließen" }));
      fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    };
    requestClose();

    expect((await screen.findByRole("alert")).textContent).toBe("Terminals konnten nicht geschlossen werden: Shell.");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Shell")).toBeTruthy();
    expect(close).toHaveBeenCalledExactlyOnceWith("session-shell");

    requestClose();
    await waitFor(() => expect(screen.queryByText("Shell")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(close).toHaveBeenCalledTimes(2);
  });
});
