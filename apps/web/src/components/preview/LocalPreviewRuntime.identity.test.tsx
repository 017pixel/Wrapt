// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalPreviewRuntime } from "./LocalPreviewRuntime";

const apiMocks = vi.hoisted(() => ({
  openPreviewSession: vi.fn(),
  previewDevicePreference: vi.fn(),
}));

vi.mock("../../lib/apiClient", () => ({
  ApiClientError: class ApiClientError extends Error {},
  apiClient: {
    openPreviewSession: apiMocks.openPreviewSession,
    previewDevicePreference: apiMocks.previewDevicePreference,
  },
}));

class TestResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => vi.stubGlobal("ResizeObserver", TestResizeObserver));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function preview(sessionKey: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <LocalPreviewRuntime targetPort={5173} sessionKey={sessionKey} />
    </QueryClientProvider>
  );
}

describe("Preview-Laufzeitidentität", () => {
  it("öffnet nach einem Zielwechsel die Session unter dem neuen stabilen Schlüssel", async () => {
    apiMocks.previewDevicePreference.mockResolvedValue(null);
    apiMocks.openPreviewSession.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      sessionKey: "preview-runtime:erste-session",
      projectId: null,
      primaryPort: 5173,
      bindings: [{ role: "primary", label: "Web", targetPort: 5173, targetProtocol: "http", slotId: 1, publicUrl: "https://preview.wrapt.test" }],
      leaseExpiresAt: "2026-09-26T12:00:00.000Z",
      routingRevision: 1,
      bridgeVersion: "v1",
      capabilities: [],
      limitations: [],
      storageProfileId: null,
      slotGeneration: 0,
    });

    const view = render(preview("preview-runtime:erste-session"));
    await waitFor(() => expect(apiMocks.openPreviewSession).toHaveBeenCalledTimes(1));
    expect(apiMocks.openPreviewSession.mock.calls[0]?.[0].sessionKey).toBe("preview-runtime:erste-session");

    view.rerender(preview("preview-runtime:zweite-session"));
    await waitFor(() => expect(apiMocks.openPreviewSession).toHaveBeenCalledTimes(2));
    expect(apiMocks.openPreviewSession.mock.calls[1]?.[0].sessionKey).toBe("preview-runtime:zweite-session");
  });
});
