// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsEasterEggs } from "./SettingsEasterEggs";

const mocks = vi.hoisted(() => ({
  getMascot: vi.fn(),
  saveMascot: vi.fn(),
}));

vi.mock("../../lib/apiClient", () => ({
  apiClient: {
    getMascot: mocks.getMascot,
    saveMascot: mocks.saveMascot,
  },
}));

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SettingsEasterEggs />
    </QueryClientProvider>,
  );
}

describe("SettingsEasterEggs", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getMascot.mockResolvedValue({ mascot: { enabled: false, scale: 1 } });
    mocks.saveMascot.mockImplementation(async (mascot: { enabled: boolean; scale: number }) => ({ mascot }));
  });

  it("zeigt den Schalter als zugängliche Switch-Zeile und bietet eine testbare Vorschau", async () => {
    renderSettings();

    const toggle = await screen.findByRole("switch", { name: /Maskottchen anzeigen/ });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("button", { name: "Capybara testen" })).toBeTruthy();
    expect(screen.getByText("In der Statusleiste pausiert")).toBeTruthy();

    fireEvent.click(toggle);
    await waitFor(() => expect(mocks.saveMascot).toHaveBeenCalledWith({ enabled: true, scale: 1 }));
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("In der Statusleiste aktiv")).toBeTruthy();
  });

  it("zeigt einen verständlichen Fehler, wenn das Speichern scheitert", async () => {
    mocks.saveMascot.mockRejectedValueOnce(new Error("offline"));
    renderSettings();

    fireEvent.click(await screen.findByRole("switch", { name: /Maskottchen anzeigen/ }));
    expect((await screen.findByRole("status")).textContent).toContain("Die Einstellung konnte nicht gespeichert werden.");
  });

  it("skaliert die Vorschau über den Größenregler und speichert beim Loslassen", async () => {
    renderSettings();

    const slider = await screen.findByRole("slider", { name: "Größe" });
    expect((slider as HTMLInputElement).value).toBe("100");
    expect(screen.getByText("100 %")).toBeTruthy();

    fireEvent.change(slider, { target: { value: "150" } });
    expect(screen.getByText("150 %")).toBeTruthy();
    // Die Vorschau folgt sofort, gespeichert wird erst beim Loslassen.
    expect(mocks.saveMascot).not.toHaveBeenCalled();

    fireEvent.pointerUp(slider);
    await waitFor(() => expect(mocks.saveMascot).toHaveBeenCalledWith({ enabled: false, scale: 1.5 }));
    expect((await screen.findByRole("status")).textContent).toContain("150 % Größe");
  });

  it("zeigt Konfetti, solange die Party läuft", async () => {
    renderSettings();
    const preview = await screen.findByRole("button", { name: "Capybara testen" });
    expect(preview.querySelector(".capy-confetti")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Party" }));
    await waitFor(() => expect(preview.querySelectorAll(".capy-confetti-piece")).toHaveLength(3));

    fireEvent.click(screen.getByRole("button", { name: "Nickerchen" }));
    await waitFor(() => expect(preview.querySelector(".capy-confetti")).toBeNull());
  });

  it("löst Gähnen, Party und Nickerchen direkt in der Vorschau aus", async () => {
    renderSettings();
    const preview = await screen.findByRole("button", { name: "Capybara testen" });
    expect(preview.getAttribute("data-sleeping")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Gähnen" }));
    await waitFor(() => expect(preview.getAttribute("data-action")).toBe("wake"));

    fireEvent.click(screen.getByRole("button", { name: "Party" }));
    await waitFor(() => expect(preview.getAttribute("data-frame")).toBe("party"));

    fireEvent.click(screen.getByRole("button", { name: "Nickerchen" }));
    await waitFor(() => expect(preview.getAttribute("data-sleeping")).toBe("true"));
    expect(preview.getAttribute("data-frame")).toBe("sleep");
  });
});
