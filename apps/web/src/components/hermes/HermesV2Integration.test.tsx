// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useAppPreferences } from "../../stores/appPreferences";
import { HermesShell } from "./HermesShell";

beforeEach(() => useAppPreferences.setState({ hermesV2Enabled: true }));
afterEach(cleanup);

describe("Hermes V2 mit echtem Dispatcher", () => {
  // Die echte Lazy-Fläche lädt auch Markdown und Highlighting. Im parallelen
  // Gesamtlauf ist deren Erstimport kein Ein-Sekunden-Versprechen; die
  // Assertionen bleiben streng, nur die Ladefrist ist großzügig.
  const LAZY_TIMEOUT = 30_000;

  it("lädt die echte native Fläche und erhält die Session in beiden Ausstiegslinks", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/hermes-agent?session=stored-id"]}>
        <HermesShell variant="route" />
      </MemoryRouter>,
    );
    const classic = await screen.findByRole("button", { name: "Hermes-Optionen" }, { timeout: 10_000 });
    fireEvent.click(classic);
    expect(
      screen.getByRole("menuitem", { name: "Klassische Oberfläche" }).getAttribute("href"),
    ).toBe("/hermes-agent?ui=classic&session=stored-id");
    expect(screen.getByRole("menuitem", { name: "In eigenem Fenster öffnen" }).getAttribute("href"))
      .toContain("/hermes-v2/standalone?session=stored-id");
    expect(container.querySelectorAll('[data-hermes-ui="v2"]')).toHaveLength(1);
    expect(container.querySelector("iframe")).toBeNull();
  }, LAZY_TIMEOUT);

  it("ordnet mehreren gemounteten Flächen eindeutige Drawer-Ziele zu", async () => {
    const { container } = render(
      <MemoryRouter>
        <HermesShell variant="route" />
        <HermesShell variant="route" />
      </MemoryRouter>,
    );
    const toggles = await screen.findAllByRole("button", { name: "Sitzungen" }, { timeout: 10_000 });
    const targets = toggles.map((toggle) => toggle.getAttribute("aria-controls"));
    expect(targets.every(Boolean)).toBe(true);
    expect(new Set(targets).size).toBe(2);
    for (const target of targets) {
      expect([...container.querySelectorAll("aside")].some((aside) => aside.id === target)).toBe(true);
    }
  }, LAZY_TIMEOUT);
});
