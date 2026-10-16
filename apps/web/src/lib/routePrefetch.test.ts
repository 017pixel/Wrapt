import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchRouteTarget } from "./routePrefetch";

const { preloadRouteArtwork, prefetchRoute } = vi.hoisted(() => ({
  preloadRouteArtwork: vi.fn(), prefetchRoute: vi.fn(),
}));
vi.mock("./routeArtworkPreload", () => ({ preloadRouteArtwork }));
vi.mock("./routeModules", () => ({ prefetchRoute }));
vi.mock("../extensions/pageRouteRegistry", () => ({
  pageRouteRegistry: { matchRoute: () => undefined },
}));

beforeEach(() => vi.clearAllMocks());

describe("Route-Vorladen", () => {
  it.each([
    ["/wrapt/notizen?note=seite#text", "/notizen"],
    ["/wrapt/", "/"],
    ["/projects?filter=leer", "/projects"],
    ["t3-code#oben", "/t3-code"],
  ])("übergibt für %s denselben bereinigten Pfad an Bilder und Routen", (href, path) => {
    const client = { prefetchQuery: vi.fn().mockResolvedValue(undefined) } as unknown as QueryClient;
    prefetchRouteTarget(client, href);
    expect(preloadRouteArtwork).toHaveBeenCalledExactlyOnceWith(path);
    expect(prefetchRoute).toHaveBeenCalledExactlyOnceWith(path);
  });
});
