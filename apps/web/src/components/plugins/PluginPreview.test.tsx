// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyPluginDraft } from "./pluginDefaults";
import { PluginPreview } from "./PluginPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Plugin-Vorschau für Host-Flächen", () => {
  it("zeigt für Sidebar-Plugins die kanonische Werkzeugroute", () => {
    render(<MemoryRouter><PluginPreview draft={emptyPluginDraft("sichtbare-seite")} /></MemoryRouter>);

    expect(screen.getByText("/plugins/tool/sichtbare-seite", { exact: true })).toBeTruthy();
    expect(screen.queryByText("/plugins/view/sichtbare-seite", { exact: true })).toBeNull();
  });

  it("zeigt ausgewählte Flächen und öffnet Overlay-Inhalte kontrolliert", () => {
    const draft = emptyPluginDraft();
    draft.surfaces = ["page", "topbar", "right-rail", "overlay"];
    draft.surfaceContributions = [
      {
        id: "status",
        surface: "topbar",
        title: "Status",
        description: "Ein kompakter Status.",
        mobileBehavior: "same",
        token: "accent",
      },
      {
        id: "details",
        surface: "right-rail",
        title: "Details",
        description: "Zusätzliche Informationen.",
        mobileBehavior: "bottom-sheet",
        token: "surfaceRaised",
      },
      {
        id: "filter",
        surface: "overlay",
        title: "Filter",
        description: "Filtere die aktuelle Ansicht.",
        mobileBehavior: "bottom-sheet",
        token: "surfaceOverlay",
      },
    ];

    render(<MemoryRouter><PluginPreview draft={draft} /></MemoryRouter>);

    expect(screen.getByText("Topbar")).toBeTruthy();
    expect(screen.getByText("Rechte Seitenleiste")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter öffnen" }));

    expect(screen.getByRole("dialog", { name: "Filter" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Filter schließen" }));
    expect(screen.queryByRole("dialog", { name: "Filter" })).toBeNull();
  });

  it("portaliert die fokussierte Vorschau aus dem verschachtelten Scroll-Container", () => {
    render(<MemoryRouter><PluginPreview draft={emptyPluginDraft()} /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Vorschau öffnen" }));

    const shell = document.querySelector(".plugin-preview-shell.is-focused");
    expect(shell?.parentElement).toBe(document.body);
    expect(screen.getByRole("button", { name: "Vorschau schließen" })).toBeTruthy();
  });

  it("öffnet externe HTTPS-Fallbacks über den sicheren Host-Broker", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const draft = emptyPluginDraft("externes-dashboard");
    draft.pageMode = "iframe";
    draft.iframeUrl = "https://example.com/dashboard";
    draft.functions = [{
      id: "open-dashboard",
      label: "Dashboard extern öffnen",
      action: "open-route",
      value: "https://example.com/dashboard",
    }];

    render(<MemoryRouter><PluginPreview draft={draft} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Dashboard extern öffnen" }));

    expect(open).toHaveBeenCalledWith("https://example.com/dashboard", "_blank", "noopener,noreferrer");
  });

  it("öffnet keine nicht erlaubten externen Protokolle", () => {
    const open = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const draft = emptyPluginDraft("unsicheres-dashboard");
    draft.pageMode = "iframe";
    draft.iframeUrl = "https://example.com/dashboard";
    draft.functions = [{
      id: "open-unsafe",
      label: "Unsichere Quelle öffnen",
      action: "open-route",
      value: "javascript:alert(1)",
    }];

    render(<MemoryRouter><PluginPreview draft={draft} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Unsichere Quelle öffnen" }));

    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("Ungültige externe URL");
  });

  it("zählt einen deklarierten Fokus-Timer nach dem Start sichtbar herunter", () => {
    vi.useFakeTimers();
    const draft = emptyPluginDraft("focus-test");
    draft.blocks = [{ id: "timer", type: "timer", title: "Fokus", content: "5", actionId: "start" }];
    draft.functions = [{ id: "start", label: "Timer starten", action: "start-timer", value: "5" }];

    render(<MemoryRouter><PluginPreview draft={draft} /></MemoryRouter>);
    expect(screen.getByRole("timer").textContent).toBe("00:05");
    fireEvent.click(screen.getByRole("button", { name: "Timer starten" }));
    act(() => vi.advanceTimersByTime(1_000));

    expect(screen.getByRole("timer").textContent).toBe("00:04");
    vi.useRealTimers();
  });

  it("speichert interaktive Eingaben und Checkboxen im lokalen Plugin-Zustand", () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
    const draft = emptyPluginDraft("checklist-test");
    draft.blocks = [
      { id: "note", type: "input", title: "Notiz", content: "Kurztext", actionId: null },
      { id: "done", type: "checkbox", title: "Erledigt", content: "", actionId: null },
      { id: "save", type: "button", title: "Speichern", content: "", actionId: "save" },
    ];
    draft.functions = [{ id: "save", label: "Speichern", action: "save-state", value: "draft" }];

    render(<MemoryRouter><PluginPreview draft={draft} /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText("Kurztext"), { target: { value: "Wichtiger Punkt" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Erledigt" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(globalThis.localStorage.getItem("wrapt.plugin.checklist-test.draft")).toContain("Wichtiger Punkt");
    expect(screen.getByRole("status").textContent).toContain("lokal gespeichert");
  });
});
