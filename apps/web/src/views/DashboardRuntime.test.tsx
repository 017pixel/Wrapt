// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LocalPort,
  LocalPortsResponse,
  Project,
  ProjectsResponse,
  TerminalSession,
  TerminalSessionsResponse,
} from "@wrapt/contracts";
import { RuntimePanel } from "./DashboardRuntime";
import type { DashboardQuery } from "./DashboardPanels";

function query<T>(data: T | undefined, overrides: Partial<DashboardQuery<T>> = {}): DashboardQuery<T> {
  return {
    data,
    isPending: data === undefined,
    isError: false,
    isFetching: false,
    refetch: vi.fn(async () => ({}) as never),
    ...overrides,
  } as unknown as DashboardQuery<T>;
}

const port = (value: Partial<LocalPort> = {}): LocalPort => ({
  port: 3000,
  address: "127.0.0.1",
  process: "vite",
  pid: 123,
  projectId: "alpha",
  projectName: "Alpha",
  protocol: "http",
  localUrl: "http://127.0.0.1:3000/",
  proxyUrl: null,
  ...value,
});

const session = (value: Partial<TerminalSession> = {}): TerminalSession => ({
  id: "00000000-0000-4000-8000-000000000001",
  runtimeId: "00000000-0000-4000-8000-000000000002",
  kind: "shell",
  mode: "agent",
  projectId: "alpha",
  cwd: "/home/tester/projects/alpha",
  pid: 456,
  cols: 120,
  rows: 32,
  status: "running",
  createdAt: "2026-07-31T10:00:00.000Z",
  updatedAt: "2026-07-31T10:01:00.000Z",
  exitCode: null,
  exitSignal: null,
  supervisor: "tmux",
  managed: true,
  connectedClients: 1,
  ...value,
});

const project = (id: string, name: string): Project => ({
  id,
  name,
  description: "",
  path: `/projects/${id}`,
  enabled: true,
  sortOrder: 0,
  availability: "available",
  activity: {
    lastWorkbenchUseAt: null,
    lastFilesystemChangeAt: null,
    lastGitCommitAt: null,
    effectiveAt: null,
  },
  previews: [],
  links: { t3Code: null, codeServer: null },
});

const portsResponse = (ports: LocalPort[]): LocalPortsResponse => ({
  ports,
  scannedAt: "2026-07-31T10:00:00.000Z",
});

const sessionsResponse = (sessions: TerminalSession[]): TerminalSessionsResponse => ({
  sessions,
  updatedAt: "2026-07-31T10:00:00.000Z",
});

const projectsResponse = (projects: Project[]): ProjectsResponse => ({
  projects,
  projectsRoot: "/projects",
  recentLimit: 8,
});

function renderPanel({
  ports = query<LocalPortsResponse>(portsResponse([])),
  sessions = query<TerminalSessionsResponse>(sessionsResponse([])),
  projects = query<ProjectsResponse>(projectsResponse([])),
}: {
  ports?: DashboardQuery<LocalPortsResponse>;
  sessions?: DashboardQuery<TerminalSessionsResponse>;
  projects?: DashboardQuery<ProjectsResponse>;
} = {}) {
  return render(
    <MemoryRouter>
      <RuntimePanel ports={ports} sessions={sessions} projects={projects} onOpenPort={vi.fn()} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RuntimePanel", () => {
  it("zeigt verfügbare Gruppen und benennt eine fehlende Quelle", () => {
    renderPanel({
      ports: query<LocalPortsResponse>(undefined, {
        isPending: false,
        isError: true,
        error: new Error("Portscan fehlgeschlagen"),
      }),
      sessions: query<TerminalSessionsResponse>(sessionsResponse([session()])),
      projects: query<ProjectsResponse>(projectsResponse([project("alpha", "Alpha")])),
    });

    expect(screen.getByText(/Ports: Portscan fehlgeschlagen/)).toBeTruthy();
    expect(screen.getByText("1 Terminal-Session")).toBeTruthy();
    expect(screen.queryByText(/0 offene Ports/)).toBeNull();
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  it("bildet Singular und Plural in Gruppen und Untertitel korrekt", () => {
    renderPanel({
      ports: query<LocalPortsResponse>(portsResponse([port()])),
      sessions: query<TerminalSessionsResponse>(sessionsResponse([session()])),
      projects: query<ProjectsResponse>(projectsResponse([project("alpha", "Alpha")])),
    });

    expect(screen.getByText("1 Port · 1 Session")).toBeTruthy();
    expect(screen.getByText("1 offener Port · 1 Terminal-Session")).toBeTruthy();
  });

  it("kürzt Einträge mit korrektem Singular und pflegt aria-expanded", () => {
    renderPanel({
      ports: query<LocalPortsResponse>(portsResponse([
        port({ port: 3000 }),
        port({ port: 3001 }),
        port({ port: 3002 }),
        port({ port: 3003 }),
      ])),
    });

    const button = screen.getByRole("button", { name: "1 weiterer Eintrag" });
    const controls = button.getAttribute("aria-controls");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toBeTruthy();

    fireEvent.click(button);

    const expanded = screen.getByRole("button", { name: "Weniger anzeigen" });
    expect(expanded.getAttribute("aria-expanded")).toBe("true");
    expect(expanded.getAttribute("aria-controls")).toBe(controls);
  });

  it("kürzt Gruppen mit korrektem Singular", () => {
    const projects = ["alpha", "beta", "delta", "gamma"];
    renderPanel({
      ports: query<LocalPortsResponse>(portsResponse(
        projects.map((id, index) => port({
          port: 3000 + index,
          projectId: id,
          projectName: id.charAt(0).toUpperCase() + id.slice(1),
        })),
      )),
      projects: query<ProjectsResponse>(projectsResponse(projects.map((id) => project(id, id.charAt(0).toUpperCase() + id.slice(1))))),
    });

    expect(screen.queryByText("Gamma")).toBeNull();
    const button = screen.getByRole("button", { name: "1 weiterer Bereich anzeigen" });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);

    expect(screen.getByText("Gamma")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Weniger anzeigen" })).toBeTruthy();
  });

  it("zeigt Altdaten bei einer fehlgeschlagenen Aktualisierung weiter", () => {
    renderPanel({
      ports: query<LocalPortsResponse>(portsResponse([port()]), { isError: true }),
    });

    expect(screen.getByText(":3000")).toBeTruthy();
    expect(screen.getByText(/Angezeigt werden die zuletzt geladenen Werte/)).toBeTruthy();
    expect(screen.getByText(/1 offener Port/)).toBeTruthy();
  });
});
