import { vi } from "vitest";

/** Browser-APIs für native Hermes-Flächen im layoutlosen jsdom. */
export function stubHermesViewport(width = 390, height = 844) {
  vi.stubGlobal("innerWidth", width);
  vi.stubGlobal("innerHeight", height);
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    matches: query.includes("orientation") ? height > width : !query.includes("coarse"),
    onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  }));
}
