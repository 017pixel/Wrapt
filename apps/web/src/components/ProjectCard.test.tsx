// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router";
import type { Project } from "@wrapt/contracts";
import { ProjectCard } from "./ProjectCard";
import { useSidebarPreferences } from "../stores/sidebarPreferences";

afterEach(() => {
  cleanup();
  useSidebarPreferences.setState({ hiddenPages: new Set(["workbench"]) });
});

const project = {
  id: "wrapt", name: "Wrapt", description: "Workbench", path: "/tmp/wrapt", enabled: true, sortOrder: 1,
  availability: "available", activity: { lastWorkbenchUseAt: null, lastFilesystemChangeAt: null, lastGitCommitAt: null, effectiveAt: null },
  previews: [], links: { t3Code: null, codeServer: "https://editor.example.test" },
} satisfies Project;

function RoutePath() {
  return <output data-testid="route-path">{useLocation().pathname}</output>;
}

it("bietet den Editor bei aktivem Dienst an", () => {
  render(<MemoryRouter><ProjectCard project={project} codeServerState="active" /><RoutePath /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Editor öffnen" }));
  expect(screen.getByTestId("route-path").textContent).toBe("/code-editor");
  expect(screen.queryByText(/Editor nicht verfügbar/)).toBeNull();
});

it("erklärt den ausgefallenen Dienst ohne Editor-Start", () => {
  render(<MemoryRouter><ProjectCard project={project} codeServerState="error" /><RoutePath /></MemoryRouter>);
  expect(screen.queryByText("Editor öffnen")).toBeNull();
  expect(screen.getByText(/Editor nicht verfügbar/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Terminal öffnen" }));
  expect(screen.getByTestId("route-path").textContent).toBe("/terminal");
});

it("zeigt den Orbit-Start erst nach Aktivierung an", () => {
  useSidebarPreferences.setState({ hiddenPages: new Set() });
  render(<MemoryRouter><ProjectCard project={project} codeServerState="active" /></MemoryRouter>);
  expect(screen.getByRole("button", { name: "Orbit öffnen" })).toBeTruthy();
});
