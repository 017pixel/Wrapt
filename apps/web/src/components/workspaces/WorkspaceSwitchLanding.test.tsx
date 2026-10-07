// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HomeRedirect } from "../../App";
import { bootstrapBuiltinContributions } from "../../extensions/builtinContributions";
import { useAppPreferences } from "../../stores/appPreferences";
import { useSidebarPreferences } from "../../stores/sidebarPreferences";
import { WorkspaceSwitchLanding } from "./WorkspaceSwitchLanding";

bootstrapBuiltinContributions();
const fragment = "#wraptWorkspaces=%5B%5D";

function LocationOutput() {
  const location = useLocation();
  return <output>{location.pathname}{location.search}{location.hash}</output>;
}

function open(path: string, pluginRoutesReady = true) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WorkspaceSwitchLanding pluginRoutesReady={pluginRoutesReady}>
        <HomeRedirect />
        <LocationOutput />
        <Link to="/projects">Projekte öffnen</Link>
      </WorkspaceSwitchLanding>
    </MemoryRouter>,
  );
}

describe("Workspace-Ankunft", () => {
  beforeEach(() => {
    useSidebarPreferences.setState({ hiddenPages: new Set(["projects", "codex"]) });
    useAppPreferences.setState({ defaultPage: "hermes-agent" });
  });
  afterEach(cleanup);

  it.each(["/hermes-agent?path=%2Fchat", "/t3-code", "/notizen", "/files", "/settings"])(
    "behält eine verfügbare Seite: %s", async (path) => {
      const { container } = open(`${path}${fragment}`);
      await waitFor(() => expect(container.querySelector("output")?.textContent).toBe(`${path}${fragment}`));
    },
  );

  it.each(["/projects", "/projects/lokales-projekt", "/codex", "/unbekannt"])(
    "fällt bei fehlender oder ausgeblendeter Zielseite auf das Dashboard zurück: %s", async (path) => {
      const { container } = open(`${path}?projekt=alt${fragment}`);
      await waitFor(() => expect(container.querySelector("output")?.textContent).toBe(`/${fragment}`));
    },
  );

  it("bleibt beim Dashboard-Wechsel trotz anderer Standardseite auf dem Dashboard", async () => {
    const { container } = open(`/${fragment}`);
    await waitFor(() => expect(container.querySelector("output")?.textContent).toBe(`/${fragment}`));
  });

  it("behält normale Direktlinks zu ausgeblendeten Seiten unverändert", () => {
    const { container } = open("/projects");
    expect(container.querySelector("output")?.textContent).toBe("/projects");
  });

  it("verwendet beim normalen App-Start weiterhin die Standardseite", async () => {
    const { container } = open("/");
    await waitFor(() => expect(container.querySelector("output")?.textContent).toBe("/hermes-agent"));
  });

  it("beschränkt den Fallback auf die Ankunft nach einem Workspace-Wechsel", async () => {
    const { container } = open(`/hermes-agent${fragment}`);
    fireEvent.click(screen.getByRole("link", { name: "Projekte öffnen" }));
    await waitFor(() => expect(container.querySelector("output")?.textContent).toBe("/projects"));
  });

  it("prüft auch kompatible Seiten-Aliase", async () => {
    useSidebarPreferences.setState({ hiddenPages: new Set(["files"]) });
    const { container } = open(`/gallery${fragment}`);
    await waitFor(() => expect(container.querySelector("output")?.textContent).toBe(`/${fragment}`));
  });

  it("wartet bei Plugin-Werkzeugen auf die Registrierung der Zielinstanz", () => {
    const { container } = open(`/plugins/tool/mein-werkzeug${fragment}`, false);
    expect(container.querySelector("output")).toBeNull();
    expect(screen.getByLabelText("Ansicht wird geladen")).toBeTruthy();
  });

  it("fällt bei fehlendem Plugin nach abgeschlossener Registrierung zum Dashboard zurück", async () => {
    const { container } = open(`/plugins/tool/mein-werkzeug${fragment}`, true);
    await waitFor(() => expect(container.querySelector("output")?.textContent).toBe(`/${fragment}`));
  });
});
