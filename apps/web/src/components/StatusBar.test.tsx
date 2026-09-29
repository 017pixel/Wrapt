// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompactSystemStatus } from "./StatusBar";

const apiMocks = vi.hoisted(() => ({ health: vi.fn() }));

vi.mock("../lib/apiClient", () => ({
  apiClient: { health: apiMocks.health },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function status() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <CompactSystemStatus />
    </QueryClientProvider>
  );
}

describe("Kompakter Systemstatus", () => {
  it("zeigt Version und Bereitschaft als benannte Region", async () => {
    apiMocks.health.mockResolvedValue({ version: "1.24.1-test" });
    render(status());
    const region = await screen.findByRole("region", { name: "Kompakter Systemstatus" });
    await waitFor(() => expect(region.textContent).toContain("v1.24.1-test"));
    expect(region.textContent).toContain("bereit");
  });

  it("meldet einen unerreichbaren Dienst", async () => {
    apiMocks.health.mockRejectedValue(new Error("offline"));
    render(status());
    const region = await screen.findByRole("region", { name: "Kompakter Systemstatus" });
    await waitFor(() => expect(region.textContent).toContain("nicht erreichbar"));
  });
});
