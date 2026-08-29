// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

function renderSettings(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AppearanceSettings />
    </QueryClientProvider>,
  );
}

describe("AppearanceSettings-Persistenz", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appearance.mockResolvedValue({ theme: initialTheme, source: "project" });
  });

  it("behält die Live-Auswahl beim erneuten Öffnen des Design-Tabs", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const firstRender = renderSettings(client);
    await screen.findByText("Vorgefertigte Themes");

    fireEvent.click(screen.getByRole("button", { name: "Ember" }));
    expect(screen.getByRole("button", { name: "Ember" }).getAttribute("aria-pressed")).toBe("true");

    firstRender.unmount();
    renderSettings(client);

    expect((await screen.findByRole("button", { name: "Ember" })).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "T3 Code" }).getAttribute("aria-pressed")).toBe("false");
  });
});
