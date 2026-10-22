// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubHermesViewport } from "../test/hermesViewport";
import { useAppPreferences } from "../stores/appPreferences";
import { HermesV2Route, HermesV2StandaloneRoute } from "./HermesV2Route";

describe("HermesV2Route", () => {
  beforeEach(() => {
    stubHermesViewport();
    window.localStorage.clear();
    useAppPreferences.setState({ hermesV2Enabled: false });
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("zeigt mit Flag aus nur die Aktivierungskarte", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/hermes-v2"]}>
        <HermesV2Route />
      </MemoryRouter>,
    );
    expect(screen.getByRole("switch", { name: /Hermes V2 aktivieren/ })).toBeTruthy();
    expect(container.querySelector("[data-hermes-ui='v2']")).toBeNull();
  });

  it("zeigt mit Flag an die native Fläche mit Sitzungsspalte", () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    const { container } = render(
      <MemoryRouter initialEntries={["/hermes-v2"]}>
        <HermesV2Route />
      </MemoryRouter>,
    );
    expect(container.querySelector(".hermesv2-sidebar")).toBeTruthy();
    expect(container.querySelector("[data-hermes-ui='v2']")).toBeTruthy();
  });

  it("rendert die Standalone-Route ohne Fensterlink", () => {
    useAppPreferences.setState({ hermesV2Enabled: true });
    render(
      <MemoryRouter initialEntries={["/hermes-v2/standalone"]}>
        <HermesV2StandaloneRoute />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: "Fenster" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sitzungen" }));
    expect(screen.getByRole("link", { name: /Zur Workbench/ })).toBeTruthy();
  });
});
