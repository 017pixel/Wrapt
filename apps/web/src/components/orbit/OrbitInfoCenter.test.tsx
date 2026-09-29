// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { OrbitBoard, ProviderUsage } from "@wrapt/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OrbitInfoCenter } from "./OrbitInfoCenter";

vi.mock("../../lib/queryOptions", () => ({
  wraptQueries: { usage: () => ({ queryKey: ["usage"], queryFn: async () => ({ providers: [] }) }) },
}));
vi.mock("../../lib/useOrbitPerformance", () => ({
  useOrbitPerformance: () => ({ fps: 60, longTaskMilliseconds: 0 }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
beforeEach(() => vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 0; }));

const board: OrbitBoard = {
  id: "team",
  name: "Team",
  viewport: { x: 0, y: 0, zoom: 0.75 },
  worldBounds: { minX: -1_000, minY: -1_000, maxX: 1_000, maxY: 1_000 },
  nodes: [],
  edges: [],
};

function renderInfo(providers: ProviderUsage[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["usage"], { providers, fetchedAt: "2026-09-26T10:00:00.000Z", lastSuccessfulFetchAt: null, cached: false });
  return render(
    <QueryClientProvider client={client}>
      <OrbitInfoCenter board={board} saving={false} dirty={false} syncError={null} syncNotice={null} updatedAt="2026-09-26T10:00:00.000Z" revision={7} activeTools={2} activePreviews={1} />
    </QueryClientProvider>,
  );
}

describe("OrbitInfoCenter", () => {
  it("zeigt in der Kurzinfo genau drei Statuspunkte", () => {
    renderInfo();
    const summary = document.getElementById("orbit-info-summary");
    expect(summary).not.toBeNull();
    expect(summary!.querySelectorAll("li")).toHaveLength(3);
    expect(summary!.textContent).toContain("Team");
    expect(summary!.textContent).toContain("0 Knoten · 0 Verbindungen");
    expect(summary!.textContent).toContain("Serverstand bestätigt");
  });

  it("öffnet Details per Touch, schließt mit Escape und stellt den Fokus wieder her", async () => {
    renderInfo();
    const trigger = screen.getByRole("button", { name: "Orbit-Information öffnen" });
    fireEvent.pointerDown(trigger, { pointerType: "touch" });
    fireEvent.click(trigger);
    expect(document.getElementById("orbit-info-summary")?.classList.contains("is-open")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Details ansehen" }));
    const dialog = screen.getByRole("dialog", { name: "Arbeitsbereich-Info" });
    expect(dialog.textContent).toContain("Asynchroner Serverabgleich");
    expect(dialog.textContent).toContain("75%");
    expect(dialog.textContent).toContain("60");
    expect(dialog.textContent).toContain("Aktive Previews");
    expect(dialog.textContent).toContain("Serverrevision");
    expect(dialog.textContent).toContain("Zuletzt aktualisiert");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("zeigt deaktivierte und nicht verfügbare Anbieter statt eines irreführenden Leerezustands", () => {
    renderInfo([
      { providerId: "codex", providerName: "Codex", status: "disabled", updatedAt: null, accounts: [], error: null },
      { providerId: "opencode", providerName: "OpenCode", status: "unavailable", updatedAt: null, accounts: [], error: { code: "AUTH", message: "Anmeldung fehlt." } },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Orbit-Information öffnen" }));
    const dialog = screen.getByRole("dialog", { name: "Arbeitsbereich-Info" });
    expect(dialog.textContent).toContain("Codex: Limitabruf ist deaktiviert.");
    expect(dialog.textContent).toContain("OpenCode: Anmeldung fehlt.");
    expect(dialog.textContent).not.toContain("Keine Limitwerte verfügbar.");
  });
});
