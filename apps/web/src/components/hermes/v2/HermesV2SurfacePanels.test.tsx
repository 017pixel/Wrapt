// UItests sichtbare Sitzungsspalte: Panel, minimal ToolPanel und Standalone
// teilen denselben Öffner, denselben Drawer und dieselben Rückwege.
// Root-E2E nutzt echte Browserbreiten; hier verifiziert jsdom das Verhalten
// der kompakte Fläche (Schließer, aria-expanded, Fensterlink, Fußzeile).
// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { stubHermesViewport } from "../../../test/hermesViewport";
import { HermesV2Surface } from "./HermesV2Surface";

vi.mock("./useHermesV2Chat", async () => {
  const { chatFixture } = await import("./composer-area-fixtures");
  return { useHermesV2Chat: () => chatFixture({ activeSnapshot: null }) };
});
vi.mock("./useHermesV2Sidebar", async () => {
  const { makeGroup, makeRow, makeSidebar } = await import("./sidebar-test-fixtures");
  // Die Spalte liefert Zeilen und Zeilenliste, wie es die echte Spalte tut.
  return {
    useHermesV2Sidebar: (options: { projectId?: string | null }) => {
      sidebarOptionen.push(options);
      return makeSidebar({ groups: [makeGroup("active", [makeRow()])] });
    },
  };
});
vi.mock("../../../lib/apiClient/projects", async () => {
  const { vi: v } = await import("vitest");
  return {
    projectsApi: {
      projects: v.fn().mockResolvedValue({
        projects: [
          { id: "wrapt", name: "Wrapt" },
          { id: "t3code", name: "T3 Code" },
        ],
        projectsRoot: "/projects",
        recentLimit: 8,
      }),
    },
  };
});

afterEach(cleanup);

/** Die Optionen, mit denen die Flaeche den Katalog fragt. */
const sidebarOptionen: { projectId?: string | null }[] = [];

function renderSurface(
  variant: "panel" | "route",
  options: { minimal?: boolean; standalone?: boolean; viewport?: [number, number] } = {},
) {
  const [breite, hoehe] = options.viewport ?? [390, 844];
  stubHermesViewport(breite, hoehe);
  return render(
    <MemoryRouter>
      <HermesV2Surface
        variant={variant}
        minimal={options.minimal ?? false}
        standalone={options.standalone ?? false}
        active
      />
    </MemoryRouter>,
  );
}

describe("HermesV2Surface – Sitzungsspalte in jeder Variante", () => {
  it("fragt den Katalog des gewaehlten Projekts ab", async () => {
    // Der Projektfilter ist keine reine Anzeige: die Auswahl gehoert zum
    // Katalog, damit die Sitzungen des Projekts erscheinen.
    sidebarOptionen.length = 0;
    // Breite Flaeche: auf dem Telefon liegt die Spalte in der Schublade.
    const view = renderSurface("route", { viewport: [1440, 900] });
    await vi.waitFor(() => {
      expect(sidebarOptionen.length).toBeGreaterThan(0);
    });
    expect(sidebarOptionen.at(-1)?.projectId).toBeNull();
    const auswahl = view.getByRole("button", { name: "Projekt" });
    fireEvent.click(auswahl);
    const eintrag = await view.findByText("Wrapt");
    fireEvent.click(eintrag);
    await vi.waitFor(() => {
      expect(sidebarOptionen.at(-1)?.projectId).toBe("wrapt");
    });
  });

  it("Panels stellen den Sitzungsöffner bereit", () => {
    for (const options of [
      { variant: "panel" as const, minimal: false },
    ]) {
      const view = renderSurface(options.variant, { minimal: options.minimal });
      const toggle = view.getByRole("button", { name: "Sitzungen" });
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
      // Drawer-Ebene existiert unabhängig von der Route(Variante).
      const layer = view.container.querySelector(".hermesv2-drawer-layer");
      expect(layer).toBeTruthy();
      // Solange der Drawer zu ist, verbirgt inert die Spalte.
      expect(layer?.hasAttribute("inert")).toBe(true);
      cleanup();
    }
  });

  it("öffnet und schließt den Drawer in einem Panel", () => {
    const view = renderSurface("panel");
    const toggle = view.getByRole("button", { name: "Sitzungen" });
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const aside = view.container.querySelector(
      "aside[aria-label='Hermes-V2-Sitzungen']",
    );
    expect(aside?.getAttribute("data-drawer-open")).toBe("true");
    expect(aside?.getAttribute("aria-hidden")).toBeNull();
    fireEvent.click(
      view.getByRole("button", { name: "Sitzungsspalte schließen" }),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(aside?.getAttribute("aria-hidden")).toBe("true");
  });

  it("verweist Toolbar und Fußzeile auf die verbleibenden Rückwege", () => {
    const panel = renderSurface("panel");
    fireEvent.click(panel.getByRole("button", { name: "Hermes-Optionen" }));
    expect(
      panel.getByRole("menuitem", { name: "Klassische Oberfläche" }),
    ).toBeTruthy();
    expect(
      panel.getByRole("menuitem", { name: "In eigenem Fenster öffnen" }),
    ).toBeTruthy();
    cleanup();
    const standalone = renderSurface("route", { standalone: true });
    // Standalone zeigt kein zusätzliches Fenster in Fenster-Logik.
    fireEvent.click(standalone.getByRole("button", { name: "Hermes-Optionen" }));
    expect(
      standalone.queryByRole("menuitem", { name: "In eigenem Fenster öffnen" }),
    ).toBeNull();
    // Rückwege liegen im Fuß der gemeinsamen Sidebar, mobil hinter dem Öffner.
    fireEvent.click(standalone.getByRole("button", { name: "Sitzungen" }));
    // Die Einstellungen liegen in den Wrapt-Einstellungen, nicht in der Sidebar.
    expect(standalone.queryByRole("link", { name: "Einstellungen" })).toBeNull();
    expect(standalone.getByRole("link", { name: "Zur Workbench" })).toBeTruthy();
    fireEvent.click(standalone.getByRole("button", { name: "Sitzungsspalte schließen" }));
  });
});

describe("HermesV2Surface – Bereichsauswahl und Umbenennen", () => {
  afterEach(cleanup);

  function renderWide(path = "/chat") {
    stubHermesViewport(1280, 900);
    return render(
      <MemoryRouter initialEntries={[path]}>
        <HermesV2Surface variant="route" active />
      </MemoryRouter>,
    );
  }

  it("setzt die Bereichsauswahl ganz unten in die Seitenleiste", () => {
    const view = renderWide();
    const aside = view.container.querySelector(
      "aside[aria-label='Hermes-V2-Sitzungen']",
    );
    const nav = aside?.querySelector(".hermesv2-areanav");
    expect(nav).toBeTruthy();
    // Die Bereichsauswahl ist das letzte Element der Spalte, unter der Chatliste.
    expect(aside?.lastElementChild).toBe(nav);
    // In der Chatfläche steht sie nicht mehr.
    expect(
      view.container.querySelector(".hermesv2-main > .hermesv2-areanav"),
    ).toBeNull();
  });

  it("öffnet das Umbenennen aus der Sitzungsspalte mit dem belegten Titel", () => {
    const view = renderWide("/chat?session=s1");
    fireEvent.click(
      view.getByRole("button", { name: "Aktionen für Erste Sitzung" }),
    );
    fireEvent.click(
      view.getByRole("menuitem", { name: "Sitzung umbenennen" }),
    );
    expect(
      view.getByRole("dialog", { name: "Sitzung umbenennen" }),
    ).toBeTruthy();
    const field = view.getByLabelText("Sitzungstitel") as HTMLInputElement;
    expect(field.value).toBe("Erste Sitzung");
  });
});
