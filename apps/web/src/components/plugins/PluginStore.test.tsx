// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { CatalogEntry } from "@wrapt/extension-contracts";
import type { PluginExample } from "@wrapt/contracts";
import { PluginStore } from "./PluginStore";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  registry: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock("../../lib/apiClient", () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiClient: {
    extensionCatalog: mocks.catalog,
    extensionRegistry: mocks.registry,
    dispatchExtensionOperation: mocks.dispatch,
  },
}));

const example = {
  exampleId: "focus-timer",
  name: "Fokus-Timer",
  slug: "focus-timer",
  description: "Ein lokaler Fokus-Timer.",
  routePath: "/plugins/view/focus-timer",
  category: "productivity",
  pageMode: "blocks",
  surfaces: ["page", "sidebar"],
} as PluginExample;

const entry = {
  manifest: { id: "wrapt.example.focus-timer", version: "0.1.0", name: "Fokus-Timer" },
  package: { integrity: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
} as unknown as CatalogEntry;

function renderStore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PluginStore examples={[example]} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PluginStore", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.catalog.mockResolvedValue({ providerId: "wrapt-catalog", revision: "sha256:catalog", entries: [entry] });
    mocks.registry.mockResolvedValue({ revision: 0, generatedAt: new Date().toISOString(), extensions: [] });
    mocks.dispatch.mockResolvedValue({});
  });

  it("zeigt für ein Beispiel nur Installieren", async () => {
    renderStore();
    expect(await screen.findByText("Fokus-Timer")).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Installieren" })).toBeTruthy();
    expect(screen.getByText("/plugins/tool/focus-timer", { exact: true })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Eigenes Plugin" })).toBeNull();
  });

  it("installiert das Beispiel über die bestehende Extension-Operation", async () => {
    renderStore();
    const installButton = await screen.findByRole("button", { name: "Installieren" });
    await waitFor(() => expect((installButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(installButton);

    await waitFor(() => {
      expect(mocks.dispatch).toHaveBeenCalledWith({
        operation: "install",
        extensionId: "wrapt.example.focus-timer",
        expectedRevision: 0,
        source: {
          kind: "catalog",
          providerId: "wrapt-catalog",
          catalogRevision: "sha256:catalog",
          version: "0.1.0",
          packageIntegrity: entry.package.integrity,
        },
        enableAfterInstall: true,
      });
    });
    expect(await screen.findByText(/Runtime bleibt bis zur verifizierten Aktivierung deaktiviert/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Wrapt neu starten" })).toBeNull();
  });

  it("lässt Installationshinweise schließen", async () => {
    renderStore();
    const installButton = await screen.findByRole("button", { name: "Installieren" });
    await waitFor(() => expect((installButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(installButton);
    expect(await screen.findByText(/„Fokus-Timer“ wurde installiert/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByText(/„Fokus-Timer“ wurde installiert/)).toBeNull();
  });

  it("deinstalliert ein installiertes Plugin mit explizitem Datenentscheid", async () => {
    mocks.registry.mockResolvedValue({
      revision: 4,
      generatedAt: new Date().toISOString(),
      extensions: [{ id: entry.manifest.id, name: "Fokus-Timer", lifecycle: "active" }],
    });
    renderStore();

    const removeButton = await screen.findByRole("button", { name: "Deinstallieren" });
    fireEvent.click(removeButton);
    fireEvent.click(within(screen.getByRole("dialog", { name: /deinstallieren/i })).getByRole("button", { name: "Deinstallieren" }));

    await waitFor(() => expect(mocks.dispatch).toHaveBeenCalledWith({
      operation: "uninstall",
      extensionId: entry.manifest.id,
      expectedRevision: 4,
      data: "delete",
    }));
  });

  it("zeigt installierte Catalog-Pakete ohne freigegebene Runtime fail-closed", async () => {
    mocks.registry.mockResolvedValue({
      revision: 6,
      generatedAt: new Date().toISOString(),
      extensions: [{ id: entry.manifest.id, name: "Fokus-Timer", lifecycle: "installed", allowedOperations: ["uninstall"] }],
    });
    renderStore();

    const activateButton = await screen.findByRole("button", { name: "Aktivieren" });
    expect((activateButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Runtime noch nicht freigegeben/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Deinstallieren" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("macht ein deinstalliertes Beispiel wieder installierbar", async () => {
    mocks.registry.mockResolvedValue({
      revision: 5,
      generatedAt: new Date().toISOString(),
      extensions: [{ id: entry.manifest.id, name: "Fokus-Timer", lifecycle: "available" }],
    });
    renderStore();

    expect(await screen.findByRole("button", { name: "Installieren" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Deinstallieren" })).toBeNull();
  });

  it("bleibt bei fehlendem Catalog-Paket fail-closed", async () => {
    mocks.catalog.mockResolvedValue({ providerId: "wrapt-catalog", revision: "sha256:catalog", entries: [] });
    renderStore();
    const button = await screen.findByRole("button", { name: "Paket fehlt" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(await screen.findByText("Paket fehlt im lokalen Catalog")).toBeTruthy();
    expect(mocks.dispatch).not.toHaveBeenCalled();
  });

  it("meldet einen unvollständig geladenen Store und bietet einen Retry", async () => {
    mocks.registry.mockRejectedValue(new Error("Registry nicht erreichbar"));
    renderStore();
    expect(await screen.findByText("Der Plugin-Store konnte nicht vollständig geladen werden.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Status fehlt" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByText("Der Plugin-Store konnte nicht vollständig geladen werden.")).toBeNull();
  });
});
