// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppPreferences } from "../../stores/appPreferences";
import { HermesV2Settings } from "./HermesV2Settings";

function renderSettings() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <HermesV2Settings />
    </MemoryRouter>,
  );
}

describe("HermesV2Settings", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppPreferences.setState({ hermesV2Enabled: false });
  });

  afterEach(cleanup);

  it("zeigt den Schalter als zugänglichen Switch im Easter-Egg-Anker", () => {
    renderSettings();
    const toggle = screen.getByRole("switch", { name: /Hermes V2 aktivieren/ });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(document.getElementById("settings-hermes-v2")).toBeTruthy();
  });

  it("persistiert Ein- und Ausschalten über die App-Präferenz", () => {
    renderSettings();
    const toggle = screen.getByRole("switch", { name: /Hermes V2 aktivieren/ });
    fireEvent.click(toggle);
    expect(useAppPreferences.getState().hermesV2Enabled).toBe(true);
    fireEvent.click(toggle);
    expect(useAppPreferences.getState().hermesV2Enabled).toBe(false);
  });

  it("bietet bei aktivem Flag den direkten Einstieg an", () => {
    renderSettings();
    expect(screen.queryByRole("link", { name: /Hermes V2 öffnen/ })).toBeNull();
    const toggle = screen.getByRole("switch", { name: /Hermes V2 aktivieren/ });
    fireEvent.click(toggle);
    expect(screen.getByRole("link", { name: /Hermes V2 öffnen/ }).getAttribute("href")).toBe(
      "/hermes-v2",
    );
  });
});
