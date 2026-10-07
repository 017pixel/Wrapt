// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render as renderWithTestingLibrary, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import type { Panel, Project } from "@wrapt/contracts";
import { projectBoundCodeServerProxyUrl, projectBoundCodeServerUrl } from "./ToolPanel";
import { ToolPanel } from "./ToolPanel";
import { RouteActivityProvider } from "../lib/routeActivity";
import { useLayoutStore } from "../stores/layout";

// Diese Suite prüft Werkzeug-Routing; xterms Canvas wird separat verifiziert.
vi.mock("./terminal/TerminalArea", () => ({ TerminalArea: () => null }));

const queryClients = new Set<QueryClient>();

function render(ui: Parameters<typeof renderWithTestingLibrary>[0]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["projects"], { projects: [] });
  queryClients.add(client);
  return renderWithTestingLibrary(ui, {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client, children }),
  });
}

afterEach(() => {
  cleanup();
  queryClients.forEach((client) => client.clear());
  queryClients.clear();
});

describe("project-bound code-server URLs", () => {
  it("always includes the validated project folder", () => {
    const path = "/home/user/projects/Wrapt";
    expect(projectBoundCodeServerProxyUrl(path)).toBe("/editor/?folder=%2Fhome%2Fuser%2Fprojects%2FWrapt");
    expect(projectBoundCodeServerUrl("https://server.example/editor/", path)).toBe("https://server.example/editor/?folder=%2Fhome%2Fuser%2Fprojects%2FWrapt");
  });
});

describe("standalone T3 Code actions", () => {
  it("lädt die serverweite T3-Instanz auch ohne Projektzuordnung über den gemeinsamen Proxy", () => {
    const panel = { id: "orbit-t3-code", type: "t3-code", projectId: null, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project: undefined, isFocused: true }));

    expect(screen.getByTitle("T3 Code").getAttribute("src")).toBe("/t3");
    expect(screen.queryByText("Projektdaten werden geladen…")).toBeNull();
  });

  it("behält das T3-iframe auch in einer geparkten Route", () => {
    const project = {
      id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: null },
    } satisfies Project;
    const panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    const renderTool = (active: boolean) => createElement(RouteActivityProvider, {
      active,
      children: createElement(ToolPanel, { panel, project, isFocused: active, standalone: true }),
    });

    const { rerender } = render(renderTool(false));
    const firstFrame = screen.getByTitle("T3 Code");
    expect(firstFrame).toBeInstanceOf(HTMLIFrameElement);

    rerender(renderTool(true));

    expect(screen.getByTitle("T3 Code")).toBe(firstFrame);
  });

  it("renders its actions in the topbar and keeps them available in fullscreen", async () => {
    const target = document.createElement("div");
    target.id = "topbar-tool-actions";
    document.body.append(target);
    const project = {
      id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: null },
    } satisfies Project;
    const panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: true, standalone: true, actionPlacement: "topbar" }));

    await waitFor(() => expect(target.querySelector(".panel-standalone-actions .tool-actions-menu.is-inline")).not.toBeNull());
    fireEvent.click(within(target).getByRole("button", { name: "Werkzeugaktionen" }));
    expect(screen.getByRole("menuitem", { name: "Neu laden" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "In neuem Tab öffnen" })).not.toBeNull();
    const firstFrame = screen.getByTitle("T3 Code");
    // Das eingebettete T3 braucht lokalen Netzwerkzugriff (Permissions-Policy).
    expect(firstFrame.getAttribute("allow")).toBe(
      "local-network-access; local-network; loopback-network",
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Neu laden" }));
    await waitFor(() => expect(screen.getByTitle("T3 Code")).not.toBe(firstFrame));
    fireEvent.click(within(target).getByRole("button", { name: "Werkzeugaktionen" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Vollbild" }));
    expect(target.querySelector(".panel-standalone-actions .tool-actions-menu.is-inline")).not.toBeNull();
    expect(document.querySelector(".tool-surface-maximized .tool-actions-menu")).toBeNull();
    fireEvent.click(within(target).getByRole("button", { name: "Werkzeugaktionen" }));
    expect(screen.getByRole("menuitem", { name: "Vollbild verlassen" })).not.toBeNull();
    target.remove();
  });

  it("renders standalone code-server actions as a flat topbar toolbar", async () => {
    const target = document.createElement("div");
    target.id = "topbar-tool-actions";
    document.body.append(target);
    const project = {
      id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: null, codeServer: "https://editor.example.test" },
    } satisfies Project;
    const panel = { id: "standalone-code-server", type: "code-server", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: true, standalone: true, actionPlacement: "topbar", codeServerMode: "embedded", codeServerState: "active" }));

    await waitFor(() => expect(target.querySelector(".panel-standalone-actions .tool-actions-menu.is-inline")).not.toBeNull());
    expect(screen.getByTitle("Editor").getAttribute("src")).toBe("/editor/?folder=%2Ftmp%2Fwrapt");
    fireEvent.click(within(target).getByRole("button", { name: "Werkzeugaktionen" }));
    expect(screen.getByRole("menuitem", { name: "Neu laden" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "In neuem Tab öffnen" })).not.toBeNull();
    target.remove();
  });

  it("shows topbar actions only for the active standalone tool", async () => {
    const target = document.createElement("div");
    target.id = "topbar-tool-actions";
    document.body.append(target);
    const project = {
      id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: "https://editor.example.test" },
    } satisfies Project;
    const t3Panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    const editorPanel = { id: "standalone-code-server", type: "code-server", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    const renderTools = (activeType: Panel["type"]) => createElement("div", null,
      createElement(RouteActivityProvider, { active: activeType === "t3-code", children: createElement(ToolPanel, { panel: t3Panel, project, isFocused: true, standalone: true, actionPlacement: "topbar" }) }),
      createElement(RouteActivityProvider, { active: activeType === "code-server", children: createElement(ToolPanel, { panel: editorPanel, project, isFocused: true, standalone: true, actionPlacement: "topbar", codeServerMode: "embedded", codeServerState: "active" }) }),
    );

    const { rerender } = render(renderTools("code-server"));
    await waitFor(() => expect(target.querySelectorAll(".tool-actions-menu")).toHaveLength(1));
    expect(within(target).getAllByRole("button", { name: "Werkzeugaktionen" })).toHaveLength(1);

    rerender(renderTools("t3-code"));
    await waitFor(() => expect(target.querySelectorAll(".tool-actions-menu")).toHaveLength(1));
    expect(within(target).getAllByRole("button", { name: "Werkzeugaktionen" })).toHaveLength(1);
    target.remove();
  });
});

describe("Code-Server-Verfügbarkeit", () => {
  const project = {
    id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
    availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [], links: { t3Code: null, codeServer: "https://editor.example.test" },
  } satisfies Project;

  it.each(["standalone", "orbit"])("zeigt bei ausgefallenem Dienst in %s keinen iframe", (surface) => {
    const panel = { id: `${surface}-code-server`, type: "code-server", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    render(createElement(ToolPanel, {
      panel, project, isFocused: true, codeServerMode: "embedded", codeServerState: "error",
      standalone: surface === "standalone", minimal: surface === "orbit",
    }));

    expect(screen.getByText(/Code-Server läuft auf diesem Gerät nicht/)).not.toBeNull();
    expect(screen.queryByTitle("Editor")).toBeNull();
  });
});

describe("fehlende Projektzuordnung", () => {
  it("zeigt für Code-Server einen bedienbaren Zustand und öffnet die Orbit-Eigenschaften", () => {
    const panel = { id: "orbit-code-server", type: "code-server", projectId: null, previewId: null, reloadKey: 0 } satisfies Panel;
    const onOpenSettings = vi.fn();
    window.addEventListener("orbit:open-tool-project-settings", onOpenSettings);

    render(createElement(ToolPanel, { panel, project: undefined, isFocused: true }));

    expect(screen.getByText("Projektzuordnung fehlt")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Projekt im Orbit auswählen" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect((onOpenSettings.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ runtimeId: panel.id });
    window.removeEventListener("orbit:open-tool-project-settings", onOpenSettings);
  });
});

describe("T3-Einbettung über den Proxy", () => {
  function t3Project(): Project {
    return {
      id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: null },
    };
  }

  it("bettet T3 same-origin über /t3 ein, damit Zurück im iframe bleibt", () => {
    const project = t3Project();
    const panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: true, standalone: true }));

    expect(screen.getByTitle("T3 Code").getAttribute("src")).toBe("/t3");
  });

  it("hängt den T3-Threadpfad an den Proxy an", () => {
    const project = t3Project();
    const panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0, t3Path: "/env-1/thread-1" } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: true, standalone: true }));

    expect(screen.getByTitle("T3 Code").getAttribute("src")).toBe("/t3/env-1/thread-1");
  });

  it("öffnet Extern auf der gehosteten App mit allen Backends", async () => {
    const target = document.createElement("div");
    target.id = "topbar-tool-actions";
    document.body.append(target);
    const project = t3Project();
    const panel = { id: "standalone-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: true, standalone: true, actionPlacement: "topbar" }));

    await waitFor(() => expect(target.querySelector(".panel-standalone-actions .tool-actions-menu.is-inline")).not.toBeNull());
    fireEvent.click(within(target).getByRole("button", { name: "Werkzeugaktionen" }));
    expect(screen.getByRole("menuitem", { name: "In neuem Tab öffnen" }).getAttribute("href")).toBe("https://t3.example.test");
    target.remove();
  });
});

describe("eingebettete Werkzeug-Eingaben", () => {  it("lässt Pointer-Gesten im Werkzeug nicht bis zum Canvas durch", () => {
    const project = {
      id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: null },
    } satisfies Project;
    const panel = { id: "orbit-t3-code", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;
    const onFocus = vi.fn();
    const onCanvasPointerDown = vi.fn();
    const { container } = render(createElement("div", { onPointerDown: onCanvasPointerDown }, createElement(ToolPanel, { panel, project, isFocused: false, onFocus })));

    fireEvent.pointerDown(container.querySelector(".tool-surface")!);

    expect(onFocus).toHaveBeenCalledOnce();
    expect(onCanvasPointerDown).not.toHaveBeenCalled();
  });
});

describe("T3 Open-in-Brücke", () => {
  const locationAssign = vi.fn();

  beforeEach(() => {
    // Der Layout-Store wird pro Test ersetzt, damit der persistierte Store
    // keinen Storage braucht (im Test-Setup ist window.localStorage nicht
    // zuverlässig vorhanden).
    vi.spyOn(useLayoutStore.getState(), "selectProject").mockImplementation(() => undefined);
    locationAssign.mockClear();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { origin: "http://localhost:3000", href: "http://localhost:3000/t3-code", assign: locationAssign },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  function sendEditorMessage(folder: string | null) {
    // jsdom setzt bei window.postMessage kein event.origin; der Handler
    // prüft es aber wie im Browser gegen window.location.origin.
    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "wrapt:open-editor", ...(folder ? { folder } : {}) },
      origin: window.location.origin,
    }));
  }

  function t3Project(): Project {
    return {
      id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
      availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
      previews: [], links: { t3Code: "https://t3.example.test", codeServer: "https://editor.example.test" },
    };
  }

  it("springt eingebettet auf die Code-Editor-Seite mit dem Zielordner des T3-Buttons", async () => {
    const project = t3Project();
    const panel = { id: "panel-t3", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: false, codeServerMode: "embedded" }));

    sendEditorMessage("/home/user/projects/foo");

    await waitFor(() => expect(locationAssign).toHaveBeenCalledWith("/wrapt/code-editor/?folder=%2Fhome%2Fuser%2Fprojects%2Ffoo"));
    expect(useLayoutStore.getState().selectProject).toHaveBeenCalledWith(project.id);
  });

  it("springt auf der eigenständigen Werkzeugseite zur Code-Editor-Seite", async () => {
    const project = t3Project();
    const panel = { id: "standalone-t3", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: true, standalone: true, actionPlacement: "topbar" }));

    sendEditorMessage("/home/user/projects/foo");

    await waitFor(() => expect(locationAssign).toHaveBeenCalledWith("/wrapt/code-editor/?folder=%2Fhome%2Fuser%2Fprojects%2Ffoo"));
  });

  it("öffnet ohne Ordner die Code-Editor-Seite mit dem Panel-Projekt", async () => {
    const project = t3Project();
    const panel = { id: "panel-t3", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: false, codeServerMode: "embedded" }));

    sendEditorMessage(null);

    await waitFor(() => expect(locationAssign).toHaveBeenCalledWith("/wrapt/code-editor/"));
    expect(useLayoutStore.getState().selectProject).toHaveBeenCalledWith(project.id);
  });

  it("navigiert ohne Panel-Projekt ohne Projektauswahl zur Code-Editor-Seite", async () => {
    const panel = { id: "panel-t3", type: "t3-code", projectId: null, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project: undefined, isFocused: false, codeServerMode: "embedded" }));

    sendEditorMessage("/home/user/projects/foo");

    await waitFor(() => expect(locationAssign).toHaveBeenCalledWith("/wrapt/code-editor/?folder=%2Fhome%2Fuser%2Fprojects%2Ffoo"));
    expect(useLayoutStore.getState().selectProject).not.toHaveBeenCalled();
  });

  it("ignoriert fremde Nachrichten ohne den Open-Editor-Typ", async () => {
    const project = t3Project();
    const panel = { id: "panel-t3", type: "t3-code", projectId: project.id, previewId: null, reloadKey: 0 } satisfies Panel;

    render(createElement(ToolPanel, { panel, project, isFocused: false, codeServerMode: "embedded" }));

    window.dispatchEvent(new MessageEvent("message", { data: { type: "unrelated" }, origin: window.location.origin }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(locationAssign).not.toHaveBeenCalled();
    expect(useLayoutStore.getState().selectProject).not.toHaveBeenCalled();
  });
});
