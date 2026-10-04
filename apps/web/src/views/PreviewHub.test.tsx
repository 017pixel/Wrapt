// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PreviewDevServerLogs, PreviewDevServerStatus, Project, ProjectsResponse } from "@wrapt/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import { openPreviewLiveWindow, openPreviewWindow } from "../lib/previewExternalOpen";
import { RouteActivityProvider } from "../lib/routeActivity";
import { freshOrbitWorkspace, useOrbitStore } from "../stores/orbit";
import { usePreviewHubStore } from "../stores/previewHub";
import { useLayoutStore } from "../stores/layout";
import { useSidebarPreferences } from "../stores/sidebarPreferences";
import { PreviewHub } from "./PreviewHub";

vi.mock("../lib/previewExternalOpen", () => ({
  openPreviewLiveWindow: vi.fn(() => ({})),
  openPreviewWindow: vi.fn(() => ({})),
}));

function project(id: string): Project {
  return {
    id,
    name: id,
    description: "Testprojekt",
    path: `/tmp/${id}`,
    enabled: true,
    sortOrder: 1,
    availability: "available",
    activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
    previews: [],
    links: { t3Code: null, codeServer: null },
  };
}

function RoutePath() {
  const location = useLocation();
  return <span data-testid="route-path">{location.pathname}</span>;
}

afterEach(() => {
  cleanup();
  window.sessionStorage.removeItem("wrapt-orbit-palette-queue");
  useSidebarPreferences.setState({ hiddenPages: new Set(["workbench"]) });
});

function renderHub(configuredProject: Project, initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const status: PreviewDevServerStatus = {
    projectId: configuredProject.id,
    state: "running",
    command: "pnpm dev",
    mainPort: 4173,
    mainServiceId: null,
    profileSource: "detected",
    services: [],
    allowedPorts: [4173],
    warnings: [],
    publicUrl: "https://preview.test/",
    pid: 1,
    startedAt: null,
    updatedAt: "2026-09-26T12:00:00.000Z",
    exitCode: null,
    message: null,
  };
  const logs: PreviewDevServerLogs = {
    projectId: configuredProject.id,
    output: "",
    truncated: false,
    services: [],
    errorCount: 0,
    warningCount: 0,
    capturedAt: "2026-09-26T12:00:00.000Z",
  };
  queryClient.setQueryData<ProjectsResponse>(["projects"], {
    projects: [configuredProject],
    projectsRoot: "/tmp",
    recentLimit: 8,
  });
  queryClient.setQueryData(["preview-dev-servers"], { runtimes: [status] });
  queryClient.setQueryData(["preview-dev-server", configuredProject.id], status);
  queryClient.setQueryData(["preview-dev-server", configuredProject.id, "logs"], logs);
  queryClient.setQueryData(["orbit"], {
    document: freshOrbitWorkspace(),
    revision: 0,
    updatedAt: "2026-09-26T12:00:00.000Z",
    initialized: true,
    syncIntervalMilliseconds: 5_000,
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <RoutePath />
        <RouteActivityProvider active>
          <PreviewHub />
        </RouteActivityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Preview-Hub-Routensynchronisierung", () => {
  beforeEach(() => {
    const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    usePreviewHubStore.persist.setOptions({ storage });
    useLayoutStore.persist.setOptions({ storage });
    usePreviewHubStore.setState({ openProjectIds: ["preview-projekt"], activeProjectId: "preview-projekt" });
    useLayoutStore.setState({ selectedProjectId: "preview-projekt" });
    useOrbitStore.setState({ hydrated: false });
    vi.mocked(openPreviewLiveWindow).mockClear();
    vi.mocked(openPreviewWindow).mockClear();
  });

  it("ignoriert Suchparameter einer anderen aktiven Route", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData<ProjectsResponse>(["projects"], {
      projects: [project("preview-projekt"), project("terminal-projekt")],
      projectsRoot: "/tmp",
      recentLimit: 8,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/terminal?project=terminal-projekt"]}>
          <RouteActivityProvider active={false}>
            <PreviewHub />
          </RouteActivityProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(usePreviewHubStore.getState()).toMatchObject({
        openProjectIds: ["preview-projekt"],
        activeProjectId: "preview-projekt",
      });
      expect(useLayoutStore.getState().selectedProjectId).toBe("preview-projekt");
    });
  });

  it("übergibt die per ID gewählte Preview samt Pfad an Orbit, auch bei gleichem Port", async () => {
    useSidebarPreferences.setState({ hiddenPages: new Set() });
    window.sessionStorage.clear();
    const configuredProject: Project = {
      ...project("preview-projekt"),
      previews: [
        { id: "frontend", name: "Frontend", url: null, targetPort: 4173, path: "/", mode: "embedded", dependencies: [] },
        { id: "admin", name: "Admin", url: null, targetPort: 4173, path: "/admin", mode: "embedded", dependencies: [] },
      ],
    };
    renderHub(configuredProject, "/previews?preview=admin");

    fireEvent.click(await screen.findByLabelText("Weitere Optionen"));
    fireEvent.click(await screen.findByRole("button", { name: /Im Orbit öffnen/ }));

    await waitFor(() => expect(screen.getByTestId("route-path").textContent).toBe("/orbit"));
    expect(JSON.parse(window.sessionStorage.getItem("wrapt-orbit-palette-queue") ?? "[]")).toContainEqual({
      type: "previewTarget",
      title: "Admin",
      projectId: "preview-projekt",
      previewId: "admin",
      targetPort: 4173,
      previewPath: "/admin",
      previewSlotId: null,
      previewStorageProfileId: null,
      previewIsolation: false,
    });
  });

  it("öffnet im Simulator den per ID gewählten Pfad, wenn mehrere Ziele denselben Port nutzen", async () => {
    const configuredProject: Project = {
      ...project("preview-projekt"),
      previews: [
        { id: "frontend", name: "Frontend", url: null, targetPort: 4173, path: "/", mode: "embedded", dependencies: [] },
        { id: "admin", name: "Admin", url: null, targetPort: 4173, path: "/admin", mode: "embedded", dependencies: [] },
      ],
    };
    renderHub(configuredProject, "/previews?preview=admin");

    fireEvent.click(await screen.findByLabelText("Weitere Optionen"));
    fireEvent.click(await screen.findByRole("button", { name: /Preview-Werkzeuge im Tab/ }));

    expect(openPreviewLiveWindow).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "preview-projekt",
      port: 4173,
      path: "/admin",
      title: "Admin",
    }));
  });

  it("zeigt bei deaktiviertem Orbit keine Orbit-Aktion", async () => {
    renderHub(project("preview-projekt"), "/previews");
    fireEvent.click(await screen.findByLabelText("Weitere Optionen"));
    expect(screen.queryByRole("button", { name: /Im Orbit öffnen/ })).toBeNull();
  });

  it("zeigt ein URL-only-Ziel an und öffnet es extern ohne Orbit oder Simulator", async () => {
    const configuredProject: Project = {
      ...project("preview-projekt"),
      previews: [{ id: "docs", name: "Dokumentation", url: "https://docs.example.test/guide", targetPort: null, path: "/guide", mode: "external", dependencies: [] }],
    };
    renderHub(configuredProject, "/previews?preview=docs");

    const targetSelect = await screen.findByRole("button", { name: "Preview-Ziel auswählen" });
    expect(targetSelect.textContent).toContain("Dokumentation");
    expect(screen.getByText("https://docs.example.test/guide").textContent).toBe("https://docs.example.test/guide");
    fireEvent.click(screen.getByLabelText("Weitere Optionen"));
    expect(screen.queryByRole("button", { name: /Im Orbit öffnen/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Preview-Werkzeuge/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Im neuen Tab öffnen/ }));

    expect(openPreviewWindow).toHaveBeenCalledWith("https://docs.example.test/guide", "preview-projekt");
    expect(openPreviewLiveWindow).not.toHaveBeenCalled();
    expect(screen.getByTestId("route-path").textContent).toBe("/previews");
  });
});
