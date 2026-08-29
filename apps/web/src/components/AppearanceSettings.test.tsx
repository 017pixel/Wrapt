// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appearanceThemePresets, type AppearanceTheme } from "@wrapt/contracts";
import { AppearanceSettings } from "./AppearanceSettings";

const mocks = vi.hoisted(() => ({
  appearance: vi.fn(),
  saveAppearance: vi.fn(),
}));

vi.mock("../lib/apiClient", () => ({
  apiClient: {
    appearance: mocks.appearance,
    saveAppearance: mocks.saveAppearance,
  },
}));

const initialTheme: AppearanceTheme = {
  preset: "t3-code",
  colors: appearanceThemePresets["t3-code"],
};

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AppearanceSettings />
    </QueryClientProvider>,
  );
}

describe("AppearanceSettings", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appearance.mockResolvedValue({ theme: initialTheme });
    mocks.saveAppearance.mockImplementation(async (theme: AppearanceTheme) => ({ theme }));
  });

  it("zeigt zehn dunkle Presets und markiert die Auswahl", async () => {
    renderSettings();

    expect(await screen.findByText("Vorgefertigte Themes")).toBeTruthy();
    expect(document.querySelectorAll("[data-theme-id]")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "T3 Code" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("DARK ONLY")).toBeNull();
    expect(screen.queryByText("Alle Themes bleiben dunkel.")).toBeNull();
    expect(screen.queryByText("Live-Vorschau")).toBeNull();
    expect(document.querySelector(".appearance-live-preview")).toBeNull();
  });

  it("übernimmt eine Preset-Auswahl, individualisiert eine Rolle und speichert sie", async () => {
    renderSettings();
    await screen.findByText("Vorgefertigte Themes");

    fireEvent.click(screen.getByRole("button", { name: "Monokai" }));
    expect(screen.getByRole("button", { name: "Monokai" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.change(screen.getByLabelText("Hover ändern"), { target: { value: "#123456" } });
    expect(screen.getByRole("button", { name: "Eigene Farben" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("#123456")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Theme speichern/ }));
    await waitFor(() => expect(mocks.saveAppearance).toHaveBeenCalledWith(expect.objectContaining({
      preset: "custom",
      colors: expect.objectContaining({ hover: "#123456" }),
    })));
    expect(await screen.findByText("Theme gespeichert.")).toBeTruthy();
  });

});
