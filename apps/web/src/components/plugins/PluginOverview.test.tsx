// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionRegistrySummary } from "@wrapt/extension-contracts";
import type { PluginDraft, PluginExample } from "@wrapt/contracts";
import { MemoryRouter } from "react-router";
import { PluginOverview } from "./PluginOverview";

vi.mock("./PluginStore", () => ({
  PluginStore: () => <div data-testid="plugin-store">Lokaler Store</div>,
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

const example = {
  exampleId: "focus-timer",
  name: "Fokus-Timer",
  slug: "focus-timer",
  description: "Ein lokaler Fokus-Timer.",
  routePath: "/plugins/view/focus-timer",
  surfaces: ["page", "sidebar"],
} as PluginExample;

function renderOverview(activeTab: "allgemein" | "eigene" | "store" | "installiert" = "allgemein") {
  return render(
    <MemoryRouter>
      <PluginOverview
        activeTab={activeTab}
        examples={[example]}
        drafts={[draft]}
        catalogEntries={[]}
        installed={[]}
        onCreate={vi.fn()}
        onTabChange={vi.fn()}
        onDeleteDraft={vi.fn()}
        onDeactivateDraft={vi.fn()}
      />
    </MemoryRouter>,
  );
}

describe("PluginOverview", () => {
  afterEach(cleanup);

  it("zeigt die Plugin-Bereiche wie die Einstellungen als Tabs", () => {
    const onTabChange = vi.fn();
    render(
      <MemoryRouter>
        <PluginOverview
          activeTab="allgemein"
          examples={[]}
          drafts={[]}
          catalogEntries={[]}
          installed={[]}
          onCreate={vi.fn()}
          onTabChange={onTabChange}
          onDeleteDraft={vi.fn()}
          onDeactivateDraft={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Allgemein" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Eigene Plugins" }));
    expect(onTabChange).toHaveBeenCalledWith("eigene");
    expect(screen.getByText("Plugin Creator")).toBeTruthy();
    expect(screen.getByText("$plugin-creator")).toBeTruthy();
  });

  it("zeigt beim eigenen aktiven Plugin Deaktivieren und Löschen", () => {
    const onDeleteDraft = vi.fn();
    const onDeactivateDraft = vi.fn();
    render(
      <MemoryRouter>
        <PluginOverview
          activeTab="eigene"
          examples={[]}
          drafts={[draft]}
          catalogEntries={[]}
          installed={[]}
          onCreate={vi.fn()}
          onTabChange={vi.fn()}
          onDeleteDraft={onDeleteDraft}
          onDeactivateDraft={onDeactivateDraft}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /deaktivieren/ }));
    expect(onDeactivateDraft).toHaveBeenCalledWith(draft.id);
    fireEvent.click(screen.getByRole("button", { name: /löschen/ }));
    fireEvent.click(screen.getByRole("button", { name: "Endgültig löschen" }));
    expect(onDeleteDraft).toHaveBeenCalledWith(draft.id);
  });

  it("zeigt eigene Plugins sofort mit Aktivierung und der korrekten Seitenroute", () => {
    const onActivateDraft = vi.fn();
    const disabledDraft = { ...draft, activationStatus: "disabled" as const };
    const { rerender } = render(
      <MemoryRouter>
        <PluginOverview
          activeTab="eigene"
          examples={[]}
          drafts={[disabledDraft]}
          catalogEntries={[]}
          installed={[]}
          onCreate={vi.fn()}
          onTabChange={vi.fn()}
          onDeleteDraft={vi.fn()}
          onActivateDraft={onActivateDraft}
          onDeactivateDraft={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /bearbeiten/i })).toBeTruthy();
    expect(document.querySelector(".plugin-draft-row.plugins-installed-row")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /aktivieren/i }));
    expect(onActivateDraft).toHaveBeenCalledWith(draft.id);
    expect(screen.queryByRole("link", { name: "Seite öffnen" })).toBeNull();

    rerender(
      <MemoryRouter>
        <PluginOverview
          activeTab="eigene"
          examples={[]}
          drafts={[draft]}
          catalogEntries={[]}
          installed={[]}
          onCreate={vi.fn()}
          onTabChange={vi.fn()}
          onDeleteDraft={vi.fn()}
          onActivateDraft={onActivateDraft}
          onDeactivateDraft={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Seite öffnen" }).getAttribute("href")).toBe("/plugins/view/mein-plugin");

    rerender(
      <MemoryRouter>
        <PluginOverview
          activeTab="eigene"
          examples={[]}
          drafts={[{ ...draft, surfaces: ["page", "sidebar"] }]}
          catalogEntries={[]}
          installed={[]}
          onCreate={vi.fn()}
          onTabChange={vi.fn()}
          onDeleteDraft={vi.fn()}
          onActivateDraft={onActivateDraft}
          onDeactivateDraft={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Seite öffnen" }).getAttribute("href")).toBe("/plugins/tool/mein-plugin");
  });

  it("rendert Store und installierte Plugins getrennt vom allgemeinen Bereich", () => {
    const { rerender } = renderOverview("allgemein");
    expect(screen.queryByTestId("plugin-store")).toBeNull();
    expect(screen.getByRole("region", { name: "Plugin-Status" })).toBeTruthy();
    expect(screen.queryByText("Lifecycle")).toBeNull();

    rerender(
      <MemoryRouter>
        <PluginOverview
        activeTab="store"
          examples={[example]}
          drafts={[draft]}
          catalogEntries={[]}
          installed={[]}
          onCreate={vi.fn()}
          onTabChange={vi.fn()}
          onDeleteDraft={vi.fn()}
          onDeactivateDraft={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("plugin-store")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Plugin-Status" })).toBeNull();

    rerender(
      <MemoryRouter>
        <PluginOverview
          activeTab="installiert"
          examples={[example]}
          drafts={[draft]}
          catalogEntries={[]}
          installed={[]}
          onCreate={vi.fn()}
          onTabChange={vi.fn()}
          onDeleteDraft={vi.fn()}
          onDeactivateDraft={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Installierte Plugins" })).toBeTruthy();
    expect(screen.queryByText("Lifecycle")).toBeNull();
  });

  it("zeigt im Installiert-Tab die vollständige Plugin-Verwaltung", () => {
    const installed = [{
      id: "wrapt.example.focus-timer",
      name: "Fokus-Timer",
      lifecycle: "active",
      desiredEnablement: "enabled",
    }] as unknown as ExtensionRegistrySummary[];
    const onEdit = vi.fn();
    const onToggle = vi.fn();
    const onUninstall = vi.fn();

    render(
      <MemoryRouter>
        <PluginOverview
          activeTab="installiert"
          examples={[example]}
          drafts={[]}
          catalogEntries={[]}
          installed={installed}
          onCreate={vi.fn()}
          onTabChange={vi.fn()}
          onDeleteDraft={vi.fn()}
          onDeactivateDraft={vi.fn()}
          onEditInstalled={onEdit}
          onToggleInstalled={onToggle}
          onUninstallInstalled={onUninstall}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Fokus-Timer bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Fokus-Timer deaktivieren" }));
    fireEvent.click(screen.getByRole("button", { name: "Fokus-Timer deinstallieren" }));

    expect(onEdit).toHaveBeenCalledWith(installed[0]);
    expect(onToggle).toHaveBeenCalledWith(installed[0]);
    expect(onUninstall).toHaveBeenCalledWith(installed[0]);
  });

  it("übersetzt fehlerhafte Lifecycle-Zustände und bietet keine ungültige Aktivierung an", () => {
    const installed = [{
      id: "wrapt.example.focus-timer",
      name: "Fokus-Timer",
      lifecycle: "incompatible",
      desiredEnablement: "disabled",
    }] as unknown as ExtensionRegistrySummary[];
    render(
      <MemoryRouter>
        <PluginOverview
          activeTab="installiert"
          examples={[example]}
          drafts={[]}
          catalogEntries={[]}
          installed={installed}
          onCreate={vi.fn()}
          onTabChange={vi.fn()}
          onDeleteDraft={vi.fn()}
          onDeactivateDraft={vi.fn()}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Nicht kompatibel")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /aktivieren/i })).toBeNull();
    expect(screen.getByRole("button", { name: "Fokus-Timer deinstallieren" })).toBeTruthy();
  });
});
