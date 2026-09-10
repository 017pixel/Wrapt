// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { defaultContextMenuConfig } from "@wrapt/contracts";
import { registerHostContextMenus, hostContextMenuId } from "../../extensions/hostContextMenus";
import { wraptQueries } from "../../lib/queryOptions";
import { ContextMenuProvider } from "./ContextMenuProvider";
import { openGlobalContextMenu } from "./contextMenuEvents";

vi.mock("../../extensions/useNavigationRegistry", () => ({
  useNavigationRegistry: () => ({
    revision: 0,
    items: [{
      contributionId: "workbench.test.navigation.files",
      value: {
        contribution: { group: "tools", label: "Dateien" },
        runtime: {},
        route: { path: "/files" },
      },
    }],
  }),
}));

function renderProvider(child: React.ReactNode, enabled = true, emptyEnabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(wraptQueries.contextMenu().queryKey, {
    contextMenu: {
      ...defaultContextMenuConfig,
      surfaces: {
        "host.context-menu.file": { enabled },
        "host.context-menu.empty": { enabled: emptyEnabled },
      },
    },
  });
  return render(<QueryClientProvider client={client}><MemoryRouter><ContextMenuProvider>{child}</ContextMenuProvider></MemoryRouter></QueryClientProvider>);
}

describe("ContextMenuProvider", () => {
  beforeEach(() => registerHostContextMenus());
  afterEach(cleanup);

  it("rendert eine kontextgebundene Registry-Aktion und führt sie aus", () => {
    const run = vi.fn();
    renderProvider(<button type="button" onContextMenu={(event) => openGlobalContextMenu(event, {
      surface: "host.context-menu.file",
      title: "Datei.txt",
      actions: [{ id: hostContextMenuId("file.open"), onSelect: run }],
    })}>Datei</button>);

    fireEvent.contextMenu(screen.getByRole("button", { name: "Datei" }), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Öffnen" }));
    expect(run).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lässt das native Verhalten zu, wenn die Surface deaktiviert ist", () => {
    renderProvider(<button type="button" onContextMenu={(event) => openGlobalContextMenu(event, {
      surface: "host.context-menu.file",
      actions: [{ id: hostContextMenuId("file.open"), onSelect: vi.fn() }],
    })}>Datei</button>, false);

    expect(fireEvent.contextMenu(screen.getByRole("button", { name: "Datei" }))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ignoriert iframe-Knoten im dokumentweiten Fallback", () => {
    renderProvider(<iframe title="Eingebettete App" data-context-menu-surface="host.context-menu.file" />);
    expect(fireEvent.contextMenu(screen.getByTitle("Eingebettete App"))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("öffnet die Schnellaktionen auf einer freien Host-Fläche", () => {
    renderProvider(<div data-testid="freie-flaeche">Freier Bereich</div>);

    expect(fireEvent.contextMenu(screen.getByTestId("freie-flaeche"), { clientX: 40, clientY: 60 })).toBe(false);
    expect(screen.getByRole("menu").getAttribute("data-surface")).toBe("host.context-menu.empty");
    expect(screen.getByRole("menuitem", { name: "Dateien" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Letzte Schritte kopieren" })).toBeTruthy();
  });

  it("kopiert das Schritte-Protokoll über die Schnellaktion", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
      JSON.stringify({ version: "1.6.0", bootId: "boot-1", webBuildId: 2 }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const { addBreadcrumb, getRecentSteps, resetBreadcrumbsForTest } = await import("../../lib/crashReport");
    resetBreadcrumbsForTest();
    addBreadcrumb("Seitenwechsel: / → /projekte");

    renderProvider(<div data-testid="freie-flaeche">Freier Bereich</div>);
    fireEvent.contextMenu(screen.getByTestId("freie-flaeche"), { clientX: 40, clientY: 60 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Letzte Schritte kopieren" }));

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = writeText.mock.calls[0]?.[0] as string;
    expect(copied).toContain("# Schritte-Protokoll — Wrapt");
    expect(copied).toContain("Seitenwechsel: / → /projekte");
    expect(copied).toContain("Auftrag an den KI-Agenten");
    expect(getRecentSteps().join("\n")).toContain("Schritte-Protokoll kopiert");
    vi.restoreAllMocks();
  });

  it("überlässt interaktiven Elementen das native Kontextmenü", () => {
    renderProvider(<button type="button">Aktion</button>);

    expect(fireEvent.contextMenu(screen.getByRole("button", { name: "Aktion" }))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("verhindert den freien Fallback für eine deaktivierte Feature-Surface", () => {
    renderProvider(<div data-testid="dateizeile" onContextMenu={(event) => openGlobalContextMenu(event, {
      surface: "host.context-menu.file",
      actions: [{ id: hostContextMenuId("file.open"), onSelect: vi.fn() }],
    })}>Dateizeile</div>, false);

    expect(fireEvent.contextMenu(screen.getByTestId("dateizeile"))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("lässt das native Verhalten zu, wenn freie Flächen deaktiviert sind", () => {
    renderProvider(<div data-testid="freie-flaeche">Freier Bereich</div>, true, false);

    expect(fireEvent.contextMenu(screen.getByTestId("freie-flaeche"))).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
