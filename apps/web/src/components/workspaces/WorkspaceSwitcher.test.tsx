// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceRegistryView } from "./WorkspaceRegistryView";
import { useWorkspaceRegistry } from "./workspaceRegistryStore";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import type * as WorkspaceStatusModule from "./workspaceStatus";

vi.mock("./workspaceStatus", async (importOriginal) => ({
  ...await importOriginal<typeof WorkspaceStatusModule>(),
  probeWorkspaceHealth: vi.fn(async () => ({ status: "live", bootId: "remote" })),
}));

let queryClient: QueryClient;

function mount(children = <WorkspaceSwitcher />) {
  return render(<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>);
}

async function openSwitcher() {
  fireEvent.click(screen.getByRole("button", { name: /Aktueller Server/ }));
  await screen.findByRole("dialog", { name: "Server wechseln" });
}

async function openDetails() {
  fireEvent.click(screen.getByRole("button", { name: /Weitere Aktionen für Zweitserver/ }));
  await screen.findByRole("group", { name: "Weitere Aktionen für Zweitserver" });
}

describe("Workspace-Menüs", () => {
  beforeEach(() => {
    localStorage.clear();
    useWorkspaceRegistry.setState({ entries: [], selfUrl: null, initialized: false, switchingWorkspace: null, changedAt: {}, deletedAt: {} });
    useWorkspaceRegistry.getState().initialize("https://main.example.ts.net", "Main");
    useWorkspaceRegistry.getState().add("Zweitserver", "https://second.example.ts.net");
    queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    queryClient.setQueryData(["health"], { version: "2.2.2", appName: "Wrapt", bootId: "main" });
  });
  afterEach(() => { cleanup(); queryClient.clear(); });

  it("bietet Hinzufügen ausschließlich in den Einstellungen an", async () => {
    const view = mount();
    await openSwitcher();
    expect(screen.queryByRole("button", { name: "Server hinzufügen" })).toBeNull();
    view.unmount();
    mount(<WorkspaceRegistryView />);
    expect(screen.getByRole("button", { name: "Server hinzufügen" })).toBeTruthy();
  });

  it("schließt beide Menüs auch bei einem außen abgefangenen Pointer-Event", async () => {
    mount(<><WorkspaceSwitcher /><button onPointerDown={(event) => event.stopPropagation()}>Außen</button></>);
    await openSwitcher();
    await openDetails();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Außen" }));
    expect(screen.queryByRole("dialog", { name: "Server wechseln" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Weitere Aktionen für Zweitserver" })).toBeNull();
  });

  it("hält die Auswahl und das Detailmenü bei Klicks im portalierten Detailmenü offen", async () => {
    mount();
    await openSwitcher();
    await openDetails();
    const check = screen.getByRole("button", { name: "Verbindung prüfen" });
    fireEvent.pointerDown(check);
    fireEvent.click(check);
    await waitFor(() => expect(screen.getByRole("button", { name: "Verbindung prüfen" })).not.toHaveProperty("disabled", true));
    expect(screen.getByRole("dialog", { name: "Server wechseln" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Weitere Aktionen für Zweitserver" })).toBeTruthy();
  });

  it("schließt beim Klick in die Hauptauswahl nur das Detailmenü", async () => {
    mount();
    await openSwitcher();
    await openDetails();
    fireEvent.pointerDown(within(screen.getByRole("dialog", { name: "Server wechseln" })).getByText("Main"));
    expect(screen.queryByRole("group", { name: "Weitere Aktionen für Zweitserver" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Server wechseln" })).toBeTruthy();
  });

  it("schließt mit Escape zuerst das Detailmenü und danach die Auswahl", async () => {
    mount();
    await openSwitcher();
    await openDetails();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: "Weitere Aktionen für Zweitserver" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Server wechseln" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Server wechseln" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /Aktueller Server/ }));
  });

  it("lässt einen aus dem Detailmenü geöffneten Bearbeitungsdialog bedienbar", async () => {
    mount();
    await openSwitcher();
    await openDetails();
    fireEvent.click(screen.getByRole("button", { name: "Bearbeiten" }));
    const input = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.pointerDown(input);
    fireEvent.change(input, { target: { value: "Anderer Name" } });
    expect(screen.getByRole("dialog", { name: "Server bearbeiten" })).toBeTruthy();
    expect(input).toHaveProperty("value", "Anderer Name");
  });
});
