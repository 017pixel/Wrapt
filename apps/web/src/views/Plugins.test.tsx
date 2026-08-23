// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { PluginDraft } from "@wrapt/contracts";
import { Plugins } from "./Plugins";

const mocks = vi.hoisted(() => ({
  examples: vi.fn(),
  drafts: vi.fn(),
  catalog: vi.fn(),
  registry: vi.fn(),
  deactivate: vi.fn(),
  creatorSkill: vi.fn(),
}));

vi.mock("../lib/apiClient", () => ({
  apiClient: {
    pluginExamples: mocks.examples,
    pluginDrafts: mocks.drafts,
    extensionCatalog: mocks.catalog,
    extensionRegistry: mocks.registry,
    deactivatePluginDraft: mocks.deactivate,
    pluginCreatorSkill: mocks.creatorSkill,
  },
}));

const draft = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Mein Plugin",
  slug: "mein-plugin",
  description: "Eine eigene Seite.",
  routePath: "/plugins/view/mein-plugin",
  updatedAt: "2026-08-22T08:00:00.000Z",
  activationStatus: "active",
  creationMode: "visual",
  surfaces: ["page"],
} as PluginDraft;

describe("Plugins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.hash = "#plugins:eigene";
    mocks.examples.mockResolvedValue({ examples: [], total: 0 });
    mocks.drafts.mockResolvedValue({ drafts: [draft] });
    mocks.catalog.mockResolvedValue({ providerId: "wrapt-catalog", revision: "sha256:catalog", entries: [] });
    mocks.registry.mockResolvedValue({ revision: 0, generatedAt: "2026-08-23T12:00:00.000Z", extensions: [] });
    mocks.deactivate.mockResolvedValue({ draft: { ...draft, activationStatus: "disabled" } });
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "";
  });

  it("lässt auch den Deaktivierungs-Hinweis schließen", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><MemoryRouter><Plugins /></MemoryRouter></QueryClientProvider>);
    const deactivate = await screen.findByRole("button", { name: /Plugin „Mein Plugin“ deaktivieren/ });
    fireEvent.click(deactivate);
    await waitFor(() => expect(mocks.deactivate).toHaveBeenCalledWith(draft.id));
    expect(await screen.findByText("Plugin wurde deaktiviert und bleibt als Draft erhalten.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hinweis schließen" }));
    expect(screen.queryByText("Plugin wurde deaktiviert und bleibt als Draft erhalten.")).toBeNull();
  });
});
